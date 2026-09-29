import { test } from "node:test";
import assert from "node:assert/strict";
import { formatYearSummary, type YearSummaryInput } from "./yearSummary.js";

const suggestion = (id: string, seq: number, userId: number, addedOn: string, status = "excluded") => ({
  id,
  seq,
  text: `место ${seq}`,
  status,
  addedByUserId: userId,
  addedByUsername: `user${userId}`,
  addedOn,
});
const item = (suggestionId: string, userId: number, addedOn: string) => ({
  suggestionId,
  addedByUserId: userId,
  addedByUsername: `user${userId}`,
  addedByHasUsername: true,
  addedOn,
});

const input: YearSummaryInput = {
  suggestions: [
    suggestion("a", 1, 1, "2026-03-01"),
    suggestion("b", 2, 1, "2026-04-01"),
    suggestion("c", 3, 2, "2026-05-01", "active"),
    suggestion("d", 4, 2, "2025-05-01"),
    suggestion("e", 5, 3, "2026-06-01", "rejected"),
  ],
  trips: [
    { pollId: "p3", suggestionId: "b", tripDate: "2026-09-26", optionSuggestionIds: ["b", "c", null] },
    { pollId: "p2", suggestionId: "a", tripDate: "2026-06-13", optionSuggestionIds: ["a", "c", null] },
    { pollId: "p1", suggestionId: "d", tripDate: "2025-08-02", optionSuggestionIds: ["d", null] },
  ],
  // user3 went twice in 2026, user1 once; user2 voted for "c" (didn't go); 2025 doesn't count.
  votes: [
    { pollId: "p3", userId: 3, username: "user3", hasUsername: true, optionIndexes: [0] },
    { pollId: "p2", userId: 3, username: "user3", hasUsername: true, optionIndexes: [0] },
    { pollId: "p3", userId: 1, username: "user1", hasUsername: true, optionIndexes: [0] },
    { pollId: "p3", userId: 2, username: "user2", hasUsername: true, optionIndexes: [1] },
    { pollId: "p1", userId: 2, username: "user2", hasUsername: true, optionIndexes: [0] },
  ],
  archive: [
    item("b", 2, "2026-09-27"),
    item("b", 2, "2026-09-27"),
    item("a", 1, "2026-06-14"),
    item("d", 2, "2025-08-03"),
  ],
};

test("year summary lists the year's trips and leaders only", () => {
  assert.equal(
    formatYearSummary(2026, input),
    [
      "🎉 Итоги 2026 года",
      "",
      "Поездок: 2",
      "• 13.06.2026 — #1 место 1",
      "• 26.09.2026 — #2 место 2",
      "",
      "Чаще всех ездили:",
      "1. @user3 — 2 поездки",
      "2. @user1 — 1 поездка",
      "",
      "Больше всего в архиве:",
      "1. #2 место 2 — 2 📷",
      "2. #1 место 1 — 1 📷",
      "",
      "Главные генераторы идей:",
      "1. @user1 — 2 идеи",
      "2. @user2 — 1 идея",
      "",
      "Больше всех пополнили архив:",
      "1. @user2 — 2",
      "2. @user1 — 1",
      "",
      "Спасибо всем, кто ездил! До встречи в новом сезоне 🏍",
    ].join("\n"),
  );
});

test("a year without trips says so", () => {
  assert.equal(formatYearSummary(2024, input), "В 2024 году поездок через бота не было.");
});
