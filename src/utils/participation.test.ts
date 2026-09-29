import { test } from "node:test";
import assert from "node:assert/strict";
import { missingVoters, ridersOf, topRiders, tripsJoined, votedForTrip, type Trip, type VoteRecord } from "./participation.js";

// Poll p1: [a, b, Мимокрокодил], went to b. Poll p2: [c, a, Мимокрокодил], went to a.
const trips: Trip[] = [
  { pollId: "p2", suggestionId: "a", tripDate: "2026-10-03", optionSuggestionIds: ["c", "a", null] },
  { pollId: "p1", suggestionId: "b", tripDate: "2026-09-26", optionSuggestionIds: ["a", "b", null] },
];
const vote = (pollId: string, userId: number, index: number): VoteRecord => ({
  pollId,
  userId,
  username: `u${userId}`,
  hasUsername: true,
  optionIndexes: [index],
});

test("voting for the confirmed place counts as going; other options don't", () => {
  assert.equal(votedForTrip(trips[1], vote("p1", 1, 1)), true);
  assert.equal(votedForTrip(trips[1], vote("p1", 1, 0)), false, "voted for another place");
  assert.equal(votedForTrip(trips[1], vote("p1", 1, 2)), false, "Мимокрокодил");
  assert.equal(votedForTrip(trips[1], vote("p2", 1, 1)), false, "another poll");
});

test("tripsJoined lists the user's trips oldest first", () => {
  const votes = [vote("p2", 1, 1), vote("p1", 1, 1), vote("p1", 2, 2)];
  assert.deepEqual(tripsJoined(1, trips, votes).map((t) => t.tripDate), ["2026-09-26", "2026-10-03"]);
  assert.deepEqual(tripsJoined(2, trips, votes), []);
});

test("topRiders ranks by trips joined", () => {
  const votes = [vote("p2", 1, 1), vote("p1", 1, 1), vote("p1", 2, 1), vote("p2", 3, 0)];
  assert.deepEqual(
    topRiders(trips, votes).map((r) => [r.username, r.trips]),
    [
      ["u1", 2],
      ["u2", 1],
    ],
  );
});

test("ridersOf lists who voted for the place the group went to", () => {
  const votes = [vote("p1", 1, 1), vote("p1", 2, 0), vote("p1", 3, 1), vote("p2", 4, 1)];
  assert.deepEqual(ridersOf(trips[1], votes).map((v) => v.userId), [1, 3]);
});

test("missingVoters: regulars from earlier polls who haven't voted in this one", () => {
  const votes = [vote("p1", 1, 1), vote("p1", 2, 0), vote("p2", 2, 1), vote("p1", 3, 2), vote("p2", 5, 0)];
  // In p2: 2 and 5 voted. Regulars 1 and 3 haven't; 5 is new (only p2) and did vote.
  assert.deepEqual(missingVoters(votes, "p2").map((v) => v.userId), [1, 3]);
  assert.deepEqual(missingVoters([], "p2"), []);
});
