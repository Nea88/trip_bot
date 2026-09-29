import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { backupDue, yearSummaryDue } from "./catchUp.js";

const TZ = "Europe/Moscow";
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ });

test("year summary: due in the first week of January if Dec 31 was missed", () => {
  assert.equal(yearSummaryDue(at("2027-01-02T10:00"), TZ, 2025), 2026);
  assert.equal(yearSummaryDue(at("2027-01-02T10:00"), TZ, null), 2026);
  assert.equal(yearSummaryDue(at("2026-12-31T12:30"), TZ, 2025), 2026, "right after noon on Dec 31");
});

test("year summary: not due once handled, before Dec 31 noon, or too late", () => {
  assert.equal(yearSummaryDue(at("2027-01-02T10:00"), TZ, 2026), null);
  assert.equal(yearSummaryDue(at("2026-12-31T11:59"), TZ, 2024), null, "last occurrence was a year ago");
  assert.equal(yearSummaryDue(at("2027-01-08T13:00"), TZ, 2025), null);
  assert.equal(yearSummaryDue(at("2026-09-28T12:00"), TZ, null), null);
});

test("backup is due weekly, and when there was none", () => {
  assert.equal(backupDue(at("2026-09-28T12:00"), null), true);
  assert.equal(backupDue(at("2026-09-28T12:00"), at("2026-09-21T13:00")), false);
  assert.equal(backupDue(at("2026-09-28T12:00"), at("2026-09-21T12:00")), true);
});
