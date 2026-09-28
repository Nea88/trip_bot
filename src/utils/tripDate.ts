import { DateTime } from "luxon";

// Rides happen on Saturday (luxon weekday 6).
export const TRIP_WEEKDAY = 6;

/**
 * The Saturday a trip happened: on or before `at` (the admin confirms it on
 * Sunday). ISO date, in `timezone`.
 */
export function tripDateFor(at: DateTime, timezone: string): string {
  const local = at.setZone(timezone);
  const daysBack = (local.weekday - TRIP_WEEKDAY + 7) % 7;
  return local.minus({ days: daysBack }).toISODate()!;
}

// The coming Saturday (today if it is Saturday) — the trip being planned.
export function upcomingTripDate(now: DateTime, timezone: string): string {
  const local = now.setZone(timezone);
  const daysAhead = (TRIP_WEEKDAY - local.weekday + 7) % 7;
  return local.plus({ days: daysAhead }).toISODate()!;
}

// "2026-09-26" → "26.09.2026".
export function formatIsoDate(isoDate: string): string {
  return DateTime.fromISO(isoDate).toFormat("dd.LL.yyyy");
}

/**
 * Trip date of a confirmed poll. Polls confirmed before tripDate existed fall
 * back to the Saturday before they closed.
 */
export function pollTripDate(
  poll: { tripDate?: string | null; closedAt: { toDate(): Date } | null },
  timezone: string,
): string | null {
  if (poll.tripDate) return poll.tripDate;
  return poll.closedAt ? tripDateFor(DateTime.fromJSDate(poll.closedAt.toDate()), timezone) : null;
}
