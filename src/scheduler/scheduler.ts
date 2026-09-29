import { schedule, type ScheduledTask } from "node-cron";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import { now } from "../utils/clock.js";
import { getGroupConfig, markReminderSent } from "../services/groupConfig.js";
import { createPollIfPossible } from "../services/pollCreation.js";
import { getLatestPollCreatedAt, getOpenPoll } from "../services/polls.js";
import { CLOSE_OUTCOME_TEXT, closeOpenPoll } from "../services/pollClosing.js";
import { notifyAdmins } from "../services/notifications.js";
import { DEFAULT_REMINDER_TEXT } from "../constants.js";
import { lastScheduledOccurrence, shouldCloseMissedPoll, shouldCreateMissedPoll } from "./missedPoll.js";
import { sendTripMemories } from "../services/memories.js";
import { runBackup } from "../services/backup.js";
import { postYearSummary } from "../services/yearSummary.js";
import { env } from "../config/env.js";

// Daily "on this day" trip memories post, in DEFAULT_TIMEZONE.
const MEMORIES_CRON = "0 12 * * *";

// The meeting point and start time must be set by Friday 20:00 (DEFAULT_TIMEZONE):
// admins get a heads-up two hours before, and a nudge at the deadline.
const MEET_REMINDER_CRON = "0 18 * * 5";
const MEET_DEADLINE_CRON = "0 20 * * 5";
const MEET_EXAMPLE = "/meet 09:00 АЗС на выезде из города";

// Weekly backup: Sunday night, when nothing else is going on.
const BACKUP_CRON = "0 3 * * 0";

// Year in review on December 31 at noon.
const YEAR_SUMMARY_CRON = "0 12 31 12 *";

let currentPollTask: ScheduledTask | null = null;
let currentReminderTask: ScheduledTask | null = null;
let currentCloseTask: ScheduledTask | null = null;
// Fixed-time jobs (memories, meet reminders, backups, year summary).
const fixedTasks: ScheduledTask[] = [];

// Reason shown to admins: the message only — never the error object, which
// may carry request details.
function failureReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

/**
 * Runs a background job (cron tick or startup catch-up). A rejected promise
 * from a cron tick would crash the process, so errors are logged instead —
 * and admins are told in DM, since a failed job otherwise goes unnoticed
 * (e.g. the weekly poll simply never appears).
 */
export async function runSafely(api: Api, name: string, job: () => Promise<void>): Promise<void> {
  try {
    await job();
  } catch (err) {
    console.error(`[scheduler] ${name} failed:`, err);
    try {
      const config = await getGroupConfig();
      await notifyAdmins(
        api,
        config.groupChatId,
        `⚠️ Не получилось: ${name}. ${failureReason(err)}\nПодробности — в логах бота.`,
      );
    } catch (notifyErr) {
      console.error("[scheduler] Failed to tell admins about the failure:", notifyErr);
    }
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

  currentPollTask = schedule(expression, () => runSafely(api, "создание опроса по расписанию", () => runScheduledPollCreation(api)), {
    timezone: env.defaultTimezone,
  });
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

  currentReminderTask = schedule(expression, () => runSafely(api, "памятка про /suggest", () => runReminder(api)), {
    timezone: env.defaultTimezone,
  });
}

// Started once at startup; unlike the poll and reminder, not configurable.
export function scheduleTripMemories(api: Api): void {
  fixedTasks.push(schedule(MEMORIES_CRON, () => runSafely(api, "пост «В этот день»", () => sendTripMemories(api)), {
    timezone: env.defaultTimezone,
  }));
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

  currentCloseTask = schedule(expression, () => runSafely(api, "автозакрытие опроса", () => runScheduledPollClose(api)), {
    timezone: env.defaultTimezone,
  });
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

/**
 * Friday check that an admin has set where and when Saturday's ride starts
 * (/meet). Only while a poll is open — that's the trip being planned.
 */
export async function remindAboutMeet(api: Api, deadlinePassed: boolean): Promise<void> {
  const config = await getGroupConfig();
  const openPoll = await getOpenPoll(config.groupChatId);
  if (!openPoll || openPoll.meetTime) return;

  const text = deadlinePassed
    ? `Уже 20:00 пятницы, а точка и время старта на завтра не указаны. Укажите: ${MEET_EXAMPLE}`
    : `До 20:00 нужно указать точку и время старта субботней поездки: ${MEET_EXAMPLE}`;
  await notifyAdmins(api, config.groupChatId, text);
}

export function scheduleMeetReminders(api: Api): void {
  const options = { timezone: env.defaultTimezone };
  fixedTasks.push(schedule(MEET_REMINDER_CRON, () => runSafely(api, "напоминание про точку старта", () => remindAboutMeet(api, false)), options));
  fixedTasks.push(schedule(MEET_DEADLINE_CRON, () => runSafely(api, "напоминание про точку старта", () => remindAboutMeet(api, true)), options));
}

export function scheduleBackups(api: Api): void {
  fixedTasks.push(schedule(BACKUP_CRON, () => runSafely(api, "резервная копия базы", () => runBackup(api)), {
    timezone: env.defaultTimezone,
  }));
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

export function scheduleYearSummary(api: Api): void {
  fixedTasks.push(schedule(YEAR_SUMMARY_CRON, () => runSafely(api, "итоги года", () => postYearSummary(api)), {
    timezone: env.defaultTimezone,
  }));
}
