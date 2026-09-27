import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHistory, type HistorySuggestion } from "./historyStats.js";

const suggestion = (
  id: string,
  userId: number,
  overrides: Partial<HistorySuggestion> = {},
): HistorySuggestion => ({
  id,
  seq: Number(id.slice(1)),
  text: `place ${id}`,
  status: "active",
  addedByUserId: userId,
  addedByUsername: `user${userId}`,
  addedAt: new Date(2026, 0, Number(id.slice(1))),
  ...overrides,
});

const day = (d: number) => new Date(2026, 5, d);

test("trips are decided polls, newest first; deleted places kept as null", () => {
  const stats = computeHistory(
    [
      { optionSuggestionIds: ["s1", "s2", null], winnerSuggestionId: "s1", closedAt: day(1) },
      { optionSuggestionIds: ["s2", "s3", null], winnerSuggestionId: "gone", closedAt: day(8) },
      { optionSuggestionIds: ["s2", null], winnerSuggestionId: null, closedAt: day(15) },
    ],
    [suggestion("s1", 1, { status: "excluded" }), suggestion("s2", 1), suggestion("s3", 2)],
    5,
  );
  assert.deepEqual(stats.trips.map((t) => t.suggestion?.id ?? null), [null, "s1"]);
});

test("authors ranked by approved ideas, then wins; pending/rejected ignored", () => {
  const stats = computeHistory(
    [{ optionSuggestionIds: ["s3", "s1", null], winnerSuggestionId: "s3", closedAt: day(1) }],
    [
      suggestion("s1", 1),
      suggestion("s2", 1, { status: "rejected" }),
      suggestion("s4", 1, { status: "pending" }),
      suggestion("s3", 2, { status: "excluded" }),
      suggestion("s5", 3),
      suggestion("s6", 3),
    ],
    5,
  );
  assert.deepEqual(
    stats.topAuthors.map((a) => [a.username, a.ideas, a.wins]),
    [
      ["user3", 2, 0],
      ["user2", 1, 1],
      ["user1", 1, 0],
    ],
  );
});

test("author name comes from the most recent suggestion", () => {
  const stats = computeHistory(
    [],
    [
      suggestion("s1", 1, { addedByUsername: "old" }),
      suggestion("s2", 1, { addedByUsername: "Вася", addedByHasUsername: false }),
    ],
    5,
  );
  assert.deepEqual(stats.topAuthors[0], { username: "Вася", hasUsername: false, ideas: 2, wins: 0 });
});

test("losers count only decided polls and only existing places", () => {
  const stats = computeHistory(
    [
      { optionSuggestionIds: ["s1", "s2", "gone", null], winnerSuggestionId: "s1", closedAt: day(1) },
      { optionSuggestionIds: ["s2", "s3", null], winnerSuggestionId: "s3", closedAt: day(8) },
      { optionSuggestionIds: ["s2", "s4", null], winnerSuggestionId: null, closedAt: day(15) },
    ],
    [suggestion("s1", 1), suggestion("s2", 1), suggestion("s3", 1), suggestion("s4", 1)],
    5,
  );
  assert.deepEqual(
    stats.topLosers.map((l) => [l.suggestion.id, l.losses, l.appearances]),
    [["s2", 2, 2]],
  );
});

test("topLimit caps authors and losers", () => {
  const suggestions = [1, 2, 3].map((n) => suggestion(`s${n}`, n));
  const stats = computeHistory(
    [{ optionSuggestionIds: ["s1", "s2", "s3", null], winnerSuggestionId: "s1", closedAt: day(1) }],
    suggestions,
    1,
  );
  assert.equal(stats.topAuthors.length, 1);
  assert.equal(stats.topLosers.length, 1);
});
