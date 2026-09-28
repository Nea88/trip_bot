import { schedule, type ScheduledTask } from "node-cron";
import type { Api } from "grammy";
import { DateTime } from "luxon";
import { getGroupConfig, markReminderSent } from "../services/groupConfig.js";
import { createPollIfPossible } from "../services/pollCreation.js";
import { getLatestPollCreatedAt } from "../services/polls.js";
import { DEFAULT_REMINDER_TEXT } from "../constants.js";
import { lastScheduledOccurrence, shouldCreateMissedPoll } from "./missedPoll.js";

let currentPollTask: ScheduledTask | null = null;
let currentReminderTask: ScheduledTask | null = null;

// A rejected promise from a cron tick would be an unhandled rejection, which
// crashes the whole process — log it instead and wait for the next tick.
async function runSafely(name: string, job: () => Promise<void>): Promise<void> {
  try {
    await job();
  } catch (err) {
    console.error(`[scheduler] ${name} failed:`, err);
  }
}

async function runScheduledPollCreation(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const result = await createPollIfPossible(api, config.groupChatId);
  if (result.kind === "already_open") {
    console.log("[scheduler] Skipped: a poll is already open.");
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
  if (config.scheduleDay == null || config.scheduleTime == null || config.timezone == null) {
    return;
  }

  const [hour, minute] = config.scheduleTime.split(":").map(Number);
  const expression = `${minute} ${hour} * * ${config.scheduleDay}`;

  currentPollTask = schedule(expression, () => runSafely("poll creation", () => runScheduledPollCreation(api)), {
    timezone: config.timezone,
  });
}

/**
 * Called at startup: node-cron only fires while the process is up, so if the
 * bot was down at the scheduled time, create that week's poll now.
 */
export async function createMissedScheduledPoll(api: Api): Promise<void> {
  const config = await getGroupConfig();
  if (config.scheduleDay == null || config.scheduleTime == null || config.timezone == null) {
    return;
  }

  const now = DateTime.now();
  const occurrence = lastScheduledOccurrence(now, config.scheduleDay, config.scheduleTime, config.timezone);
  const lastCreatedAt = await getLatestPollCreatedAt();
  const scheduleSetAt = config.scheduleSetAt?.toDate() ?? null;
  const missed = shouldCreateMissedPoll(
    occurrence,
    now,
    lastCreatedAt ? DateTime.fromJSDate(lastCreatedAt) : null,
    scheduleSetAt ? DateTime.fromJSDate(scheduleSetAt) : null,
  );
  if (!missed) return;

  console.log(`[scheduler] Scheduled poll at ${occurrence.toISO()} was missed — creating it now.`);
  await runScheduledPollCreation(api);
}

async function runReminder(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const today = DateTime.now().setZone(config.reminderTimezone ?? "UTC").toISODate();

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
  if (config.reminderTime == null || config.reminderTimezone == null) {
    return;
  }

  const [hour, minute] = config.reminderTime.split(":").map(Number);
  const expression = `${minute} ${hour} * * *`;

  currentReminderTask = schedule(expression, () => runSafely("reminder", () => runReminder(api)), {
    timezone: config.reminderTimezone,
  });
}
