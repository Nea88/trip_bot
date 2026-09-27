import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWinner } from "./pollWinner.js";

test("single winner among real options", () => {
  const result = computeWinner(["a", "b", "c", null], [1, 5, 2, 0]);
  assert.deepEqual(result, { kind: "single", candidateSuggestionIds: ["b"], voterCounts: [5] });
});

test("tie returns every top option in poll order", () => {
  const result = computeWinner(["a", "b", "c", null], [3, 1, 3, 0]);
  assert.deepEqual(result, { kind: "tie", candidateSuggestionIds: ["a", "c"], voterCounts: [3, 3] });
});

test("Мимокрокодил can't win even with the most votes", () => {
  const result = computeWinner(["a", "b", null], [1, 2, 10]);
  assert.deepEqual(result, { kind: "single", candidateSuggestionIds: ["b"], voterCounts: [2] });
});

test("only Мимокрокодил votes means no_votes", () => {
  const result = computeWinner(["a", "b", null], [0, 0, 4]);
  assert.equal(result.kind, "no_votes");
  assert.deepEqual(result.candidateSuggestionIds, []);
});

test("nobody voted means no_votes", () => {
  assert.equal(computeWinner(["a", null], [0, 0]).kind, "no_votes");
});
