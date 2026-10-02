import { schedule, type ScheduledTask } from "node-cron";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import { now } from "../utils/clock.js";
import { getGroupConfig, markReminderSent } from "../services/groupConfig.js";
import { createPollIfPossible } from "../services/pollCreation.js";
import { getLatestPollCreatedAt, getOpenPoll } from "../services/polls.js";
import { CLOSE_OUTCOME_TEXT, closeOpenPoll } from "../services/pollClosing.js";
import { DEFAULT_REMINDER_TEXT } from "../constants.js";
import {
  lastScheduledOccurrence,
  MISSED_POLL_GRACE_HOURS,
  shouldCloseMissedPoll,
  shouldCreateMissedPoll,
} from "./missedPoll.js";
import { backupDue, yearSummaryDue } from "./catchUp.js";
import { runBackup } from "../services/backup.js";
import { postYearSummary } from "../services/yearSummary.js";
import { env } from "../config/env.js";
import { runSafely } from "./runSafely.js";
import { FIXED_JOBS } from "./fixedJobs.js";

let currentPollTask: ScheduledTask | null = null;
let currentReminderTask: ScheduledTask | null = null;
let currentCloseTask: ScheduledTask | null = null;
// Fixed-time jobs from FIXED_JOBS (fixedJobs.ts).
const fixedTasks: ScheduledTask[] = [];

// node-cron silently drops a run whose timer fires more than a second late
// (it only logs "missed execution"). That happens when the wall clock jumps
// forward after the timer was armed — e.g. an NTP sync on the Pi, which has
// no hardware clock — so run late jobs instead of skipping them.
const CRON_OPTIONS = { timezone: env.defaultTimezone, missedExecutionTolerance: 60 * 60 * 1000 };
// The weekly poll and its close matter most; late still beats never, within
// the same window the startup catch-up uses.
const WEEKLY_POLL_CRON_OPTIONS = { ...CRON_OPTIONS, missedExecutionTolerance: MISSED_POLL_GRACE_HOURS * 60 * 60 * 1000 };

export function scheduleFixedJobs(api: Api): void {
  for (const job of FIXED_JOBS) {
    fixedTasks.push(
      schedule(job.cron, () => runSafely(api, job.name, () => job.run(api)), CRON_OPTIONS),
    );
  }
}



async function runScheduledPollCreation(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const result = await createPollIfPossible(api, config.groupChatId);
  if (result.kind === "already_open" || result.kind === "in_progress") {
    console.log(`[scheduler] Skipped: a poll is already ${result.kind === "already_open" ? "open" : "being created"}.`);
  } else if (result.kind === "no_suggestions") {
    console.log("[scheduler] Skipped: no active suggestions.");
  } else {
    console.log(`[scheduler] Created poll with ${result.optionCount} options.`);
  }
}

export async function rescheduleFromConfig(api: Api): Promise<void> {
  if (currentPollTask) {
    await currentPollTask.stop();
    currentPollTask = null;
  }

  const config = await getGroupConfig();
  if (config.scheduleDay == null || config.scheduleTime == null) {
    return;
  }

  const [hour, minute] = config.scheduleTime.split(":").map(Number);
  const expression = `${minute} ${hour} * * ${config.scheduleDay}`;

  currentPollTask = schedule(expression, () => runSafely(api, "создание опроса по расписанию", () => runScheduledPollCreation(api)), WEEKLY_POLL_CRON_OPTIONS);
}

/**
 * Called at startup: node-cron only fires while the process is up, so if the
 * bot was down at the scheduled time, create that week's poll now.
 */
export async function createMissedScheduledPoll(api: Api): Promise<void> {
  const config = await getGroupConfig();
  if (config.scheduleDay == null || config.scheduleTime == null) {
    return;
  }

  const current = now();
  const occurrence = lastScheduledOccurrence(current, config.scheduleDay, config.scheduleTime, env.defaultTimezone);
  const lastCreatedAt = await getLatestPollCreatedAt();
  const scheduleSetAt = config.scheduleSetAt?.toDate() ?? null;
  const missed = shouldCreateMissedPoll(
    occurrence,
    current,
    lastCreatedAt ? DateTime.fromJSDate(lastCreatedAt) : null,
    scheduleSetAt ? DateTime.fromJSDate(scheduleSetAt) : null,
  );
  if (!missed) return;

  console.log(`[scheduler] Scheduled poll at ${occurrence.toISO()} was missed — creating it now.`);
  await runScheduledPollCreation(api);
}

export async function runReminder(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const today = now().setZone(env.defaultTimezone).toISODate();

  if (today && config.lastReminderSentDate) {
    const daysSinceLastSent = DateTime.fromISO(today).diff(
      DateTime.fromISO(config.lastReminderSentDate),
      "days",
    ).days;
    // Every-other-day cadence: skip if we sent one less than 2 days ago.
    if (daysSinceLastSent < 2) {
      console.log("[scheduler] Skipped reminder (every-other-day schedule).");
      return;
    }
  }

  const text = config.reminderText ?? DEFAULT_REMINDER_TEXT;
  await api.sendMessage(config.groupChatId, text);
  if (today) {
    await markReminderSent(today);
  }
  console.log("[scheduler] Sent suggestion reminder.");
}

export async function rescheduleReminderFromConfig(api: Api): Promise<void> {
  if (currentReminderTask) {
    await currentReminderTask.stop();
    currentReminderTask = null;
  }

  const config = await getGroupConfig();
  if (config.reminderTime == null) {
    return;
  }

  const [hour, minute] = config.reminderTime.split(":").map(Number);
  const expression = `${minute} ${hour} * * *`;

  currentReminderTask = schedule(expression, () => runSafely(api, "памятка про /suggest", () => runReminder(api)), CRON_OPTIONS);
}


async function runScheduledPollClose(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const outcome = await closeOpenPoll(api, config.groupChatId);
  console.log(`[scheduler] Auto-close: ${outcome}.`);
  // Nothing open is normal (e.g. cancelled earlier); the group only hears
  // about closes that actually happened without a confirmation message.
  if (outcome === "message_gone" || outcome === "no_votes") {
    await api.sendMessage(config.groupChatId, CLOSE_OUTCOME_TEXT[outcome]);
  }
}

export async function rescheduleCloseFromConfig(api: Api): Promise<void> {
  if (currentCloseTask) {
    await currentCloseTask.stop();
    currentCloseTask = null;
  }

  const config = await getGroupConfig();
  if (config.closeScheduleDay == null || config.closeScheduleTime == null) {
    return;
  }

  const [hour, minute] = config.closeScheduleTime.split(":").map(Number);
  const expression = `${minute} ${hour} * * ${config.closeScheduleDay}`;

  currentCloseTask = schedule(expression, () => runSafely(api, "автозакрытие опроса", () => runScheduledPollClose(api)), WEEKLY_POLL_CRON_OPTIONS);
}

// Called at startup: close a poll whose scheduled auto-close was missed.
export async function closeMissedScheduledPoll(api: Api): Promise<void> {
  const config = await getGroupConfig();
  if (config.closeScheduleDay == null || config.closeScheduleTime == null) {
    return;
  }
  const openPoll = await getOpenPoll(config.groupChatId);
  const createdAt = openPoll?.createdAt?.toDate();
  if (!openPoll || !createdAt) return;

  const occurrence = lastScheduledOccurrence(
    now(),
    config.closeScheduleDay,
    config.closeScheduleTime,
    env.defaultTimezone,
  );
  const setAt = config.closeScheduleSetAt?.toDate();
  if (!shouldCloseMissedPoll(occurrence, DateTime.fromJSDate(createdAt), setAt ? DateTime.fromJSDate(setAt) : null)) {
    return;
  }

  console.log(`[scheduler] Auto-close at ${occurrence.toISO()} was missed — closing now.`);
  await runScheduledPollClose(api);
}




// Stops every cron job — on shutdown, and in tests, which would otherwise
// never exit with live cron timers.
export async function stopAllTasks(): Promise<void> {
  for (const task of [currentPollTask, currentCloseTask, currentReminderTask, ...fixedTasks]) {
    await task?.stop();
  }
  currentPollTask = null;
  currentCloseTask = null;
  currentReminderTask = null;
  fixedTasks.length = 0;
}


// Startup catch-up: the Dec 31 post, if the bot was down at that moment.
export async function catchUpYearSummary(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const year = yearSummaryDue(now(), env.defaultTimezone, config.lastYearSummaryYear ?? null);
  if (year === null) return;
  console.log(`[scheduler] Year summary for ${year} was missed — posting it now.`);
  await postYearSummary(api, year);
}

// Startup catch-up: a weekly backup missed while the bot was down.
export async function catchUpBackup(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const last = config.lastBackupAt ? DateTime.fromISO(config.lastBackupAt) : null;
  if (!backupDue(now(), last)) return;
  console.log("[scheduler] Weekly backup is overdue — making it now.");
  await runBackup(api);
}

