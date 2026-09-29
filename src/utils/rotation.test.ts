import { test } from "node:test";
import assert from "node:assert/strict";
import { lastShownAtFromPolls, pickPollOptions } from "./rotation.js";

const place = (id: string, addedAt: number) => ({ id, addedAt });
const ids = (list: { id: string }[]) => list.map((p) => p.id);

test("with no history it's the newest places, shown oldest-first", () => {
  const active = [place("a", 1), place("b", 2), place("c", 3), place("d", 4)];
  assert.deepEqual(ids(pickPollOptions(active, new Map(), 3)), ["b", "c", "d"]);
});

test("never-shown places go first, then the ones shown longest ago", () => {
  const active = [place("old1", 1), place("old2", 2), place("old3", 3), place("new", 10)];
  const shown = new Map([
    ["old1", 500],
    ["old2", 100],
    ["old3", 300],
  ]);
  assert.deepEqual(ids(pickPollOptions(active, shown, 3)), ["old2", "old3", "new"]);
});

test("places shown together are tie-broken by newest", () => {
  const active = [place("a", 1), place("b", 2), place("c", 3)];
  const shown = new Map([
    ["a", 100],
    ["b", 100],
    ["c", 100],
  ]);
  assert.deepEqual(ids(pickPollOptions(active, shown, 2)), ["b", "c"]);
});

test("everything fits → everything is in", () => {
  const active = [place("a", 1), place("b", 2)];
  assert.deepEqual(ids(pickPollOptions(active, new Map([["a", 5]]), 9)), ["a", "b"]);
});

test("lastShownAtFromPolls keeps each place's latest poll and skips Мимокрокодил", () => {
  const map = lastShownAtFromPolls([
    { optionSuggestionIds: ["a", "b", null], createdAt: 100 },
    { optionSuggestionIds: ["b", null], createdAt: 300 },
    { optionSuggestionIds: ["a", null], createdAt: 50 },
  ]);
  assert.deepEqual([...map.entries()].sort(), [
    ["a", 100],
    ["b", 300],
  ]);
});
