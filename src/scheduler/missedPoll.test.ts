import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { lastScheduledOccurrence, shouldCreateMissedPoll } from "./missedPoll.js";

const TZ = "Europe/Moscow";
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ });

// 2026-09-25 is a Friday (cron day 5).
test("occurrence earlier the same day", () => {
  const occ = lastScheduledOccurrence(at("2026-09-25T12:00"), 5, "10:00", TZ);
  assert.equal(occ.toISO(), at("2026-09-25T10:00").toISO());
});

test("same day but before the time goes back a week", () => {
  const occ = lastScheduledOccurrence(at("2026-09-25T09:59"), 5, "10:00", TZ);
  assert.equal(occ.toISO(), at("2026-09-18T10:00").toISO());
});

test("later in the week goes back to that week's day", () => {
  const occ = lastScheduledOccurrence(at("2026-09-28T08:00"), 5, "10:00", TZ);
  assert.equal(occ.toISO(), at("2026-09-25T10:00").toISO());
});

test("Sunday is cron day 0", () => {
  const occ = lastScheduledOccurrence(at("2026-09-28T08:00"), 0, "18:30", TZ);
  assert.equal(occ.toISO(), at("2026-09-27T18:30").toISO());
});

test("exact scheduled minute counts as the occurrence", () => {
  const occ = lastScheduledOccurrence(at("2026-09-25T10:00"), 5, "10:00", TZ);
  assert.equal(occ.toISO(), at("2026-09-25T10:00").toISO());
});

test("works when now is given in another zone", () => {
  const nowUtc = DateTime.fromISO("2026-09-25T07:30Z"); // 10:30 in Moscow
  const occ = lastScheduledOccurrence(nowUtc, 5, "10:00", TZ);
  assert.equal(occ.toISO(), at("2026-09-25T10:00").toISO());
});

const occurrence = at("2026-09-25T10:00");

test("missed: no poll since the occurrence", () => {
  assert.equal(shouldCreateMissedPoll(occurrence, at("2026-09-25T15:00"), at("2026-09-18T10:00"), null), true);
  assert.equal(shouldCreateMissedPoll(occurrence, at("2026-09-25T15:00"), null, null), true);
});

test("not missed: a poll was created after the occurrence", () => {
  assert.equal(shouldCreateMissedPoll(occurrence, at("2026-09-25T15:00"), at("2026-09-25T10:00:05"), null), false);
});

test("too late: beyond the grace window", () => {
  assert.equal(shouldCreateMissedPoll(occurrence, at("2026-09-27T10:01"), null, null), false);
  assert.equal(shouldCreateMissedPoll(occurrence, at("2026-09-27T09:59"), null, null), true);
});

test("schedule set after the occurrence doesn't fire for it", () => {
  assert.equal(shouldCreateMissedPoll(occurrence, at("2026-09-25T15:00"), null, at("2026-09-25T12:00")), false);
  assert.equal(shouldCreateMissedPoll(occurrence, at("2026-09-25T15:00"), null, at("2026-09-20T12:00")), true);
});
