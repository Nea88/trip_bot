import { DateTime } from "luxon";

// A missed year-end post still makes sense in the first days of January.
export const YEAR_SUMMARY_GRACE_DAYS = 7;
export const BACKUP_INTERVAL_DAYS = 7;

/**
 * Which year's summary should be posted now, if the Dec 31 12:00 post was
 * missed (bot down) and hasn't been handled yet; null otherwise.
 */
export function yearSummaryDue(now: DateTime, timezone: string, lastHandledYear: number | null): number | null {
  const local = now.setZone(timezone);
  let occurrence = DateTime.fromObject({ year: local.year, month: 12, day: 31, hour: 12 }, { zone: timezone });
  if (occurrence > local) occurrence = occurrence.minus({ years: 1 });
  if (local.diff(occurrence, "days").days > YEAR_SUMMARY_GRACE_DAYS) return null;
  if (lastHandledYear !== null && lastHandledYear >= occurrence.year) return null;
  return occurrence.year;
}

// The weekly backup is overdue (missed Sunday, or never made).
export function backupDue(now: DateTime, lastBackupAt: DateTime | null): boolean {
  return lastBackupAt === null || now.diff(lastBackupAt, "days").days >= BACKUP_INTERVAL_DAYS;
}
