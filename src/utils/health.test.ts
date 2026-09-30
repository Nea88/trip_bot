import { test } from "node:test";
import assert from "node:assert/strict";
import { healthStatus } from "./health.js";

test("healthy only when polling is recent and Firestore answers", () => {
  assert.deepEqual(healthStatus({ botRunning: true, msSinceLastPoll: 1000, firestoreOk: true }), { code: 200, body: "ok" });
});

test("each failing part is named", () => {
  assert.deepEqual(healthStatus({ botRunning: true, msSinceLastPoll: 1000, firestoreOk: false }), {
    code: 503,
    body: "firestore unavailable",
  });
  assert.deepEqual(healthStatus({ botRunning: false, msSinceLastPoll: 90_000, firestoreOk: false }), {
    code: 503,
    body: "telegram polling stalled; firestore unavailable",
  });
});

test("a handler waiting out 429 retries doesn't count as stalled polling", () => {
  assert.equal(healthStatus({ botRunning: true, msSinceLastPoll: 200_000, firestoreOk: true }).code, 200);
  assert.equal(healthStatus({ botRunning: true, msSinceLastPoll: 240_000, firestoreOk: true }).code, 503);
});
