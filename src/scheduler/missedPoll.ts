import { DateTime } from "luxon";

// How late a missed scheduled poll may still be created at startup. Past
// this, a poll would land too close to the next scheduled one to be useful.
export const MISSED_POLL_GRACE_HOURS = 48;

/**
 * Most recent moment (at or before `now`) matching the weekly schedule.
 * `day` uses cron numbering (0 = Sunday), `time` is "HH:MM" in `timezone`.
 */
export function lastScheduledOccurrence(
  now: DateTime,
  day: number,
  time: string,
  timezone: string,
): DateTime {
  const [hour, minute] = time.split(":").map(Number);
  const local = now.setZone(timezone);
  const luxonWeekday = day === 0 ? 7 : day;
  const daysBack = (local.weekday - luxonWeekday + 7) % 7;
  const atTime = (d: DateTime) => d.set({ hour, minute, second: 0, millisecond: 0 });

  const candidate = atTime(local.minus({ days: daysBack }));
  return candidate > local ? atTime(local.minus({ days: daysBack + 7 })) : candidate;
}

/**
 * A scheduled run was missed (the bot was down) if it happened recently, no
 * poll was created since, and the schedule already existed back then — a
 * schedule set just now shouldn't fire for a moment before it was set.
 */
export function shouldCreateMissedPoll(
  occurrence: DateTime,
  now: DateTime,
  lastPollCreatedAt: DateTime | null,
  scheduleSetAt: DateTime | null,
): boolean {
  if (now.diff(occurrence, "hours").hours > MISSED_POLL_GRACE_HOURS) return false;
  if (scheduleSetAt && scheduleSetAt > occurrence) return false;
  return lastPollCreatedAt === null || lastPollCreatedAt < occurrence;
}

/**
 * The open poll should have been auto-closed while the bot was down: it was
 * created before the last scheduled close, and that close was already
 * configured then. Closing late is harmless, so there's no grace window.
 */
export function shouldCloseMissedPoll(
  closeOccurrence: DateTime,
  pollCreatedAt: DateTime,
  closeScheduleSetAt: DateTime | null,
): boolean {
  if (closeScheduleSetAt && closeScheduleSetAt > closeOccurrence) return false;
  return pollCreatedAt < closeOccurrence;
}
