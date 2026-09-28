import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { now, resetClock, setClock } from "./clock.js";

test("setClock pins now() until resetClock", () => {
  const fixed = DateTime.fromISO("2026-09-27T12:00Z");
  setClock(() => fixed);
  assert.equal(now().toISO(), fixed.toISO());
  resetClock();
  assert.ok(Math.abs(now().toMillis() - Date.now()) < 1000);
});
