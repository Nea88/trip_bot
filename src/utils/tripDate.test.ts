import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { formatIsoDate, pollTripDate, tripDateFor, upcomingTripDate } from "./tripDate.js";

const TZ = "Europe/Moscow";
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ });

// 2026-09-26 is a Saturday.
test("tripDateFor is the Saturday on or before", () => {
  assert.equal(tripDateFor(at("2026-09-27T15:00"), TZ), "2026-09-26"); // Sunday
  assert.equal(tripDateFor(at("2026-09-26T23:00"), TZ), "2026-09-26"); // Saturday itself
  assert.equal(tripDateFor(at("2026-09-30T10:00"), TZ), "2026-09-26"); // late confirmation, Wednesday
  assert.equal(tripDateFor(at("2026-09-25T10:00"), TZ), "2026-09-19"); // Friday → previous week
});

test("tripDateFor uses the group's timezone", () => {
  // Saturday 22:30 UTC is already Sunday in Moscow — still that Saturday's trip.
  assert.equal(tripDateFor(DateTime.fromISO("2026-09-26T22:30Z"), TZ), "2026-09-26");
});

test("upcomingTripDate is the Saturday on or after", () => {
  assert.equal(upcomingTripDate(at("2026-09-25T19:00"), TZ), "2026-09-26"); // Friday
  assert.equal(upcomingTripDate(at("2026-09-26T08:00"), TZ), "2026-09-26"); // Saturday
  assert.equal(upcomingTripDate(at("2026-09-27T08:00"), TZ), "2026-10-03"); // Sunday
});

test("formatIsoDate", () => {
  assert.equal(formatIsoDate("2026-09-26"), "26.09.2026");
});

test("pollTripDate prefers the stored date, else the Saturday before closing", () => {
  const closedSunday = { toDate: () => at("2026-09-27T12:00").toJSDate() };
  assert.equal(pollTripDate({ tripDate: "2026-09-19", closedAt: closedSunday }, TZ), "2026-09-19");
  assert.equal(pollTripDate({ closedAt: closedSunday }, TZ), "2026-09-26");
  assert.equal(pollTripDate({ closedAt: null }, TZ), null);
});
