import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTop, topBy } from "./leaderboard.js";
import type { YearSummaryInput } from "./yearSummary.js";

const input: YearSummaryInput = {
  suggestions: [
    { id: "a", seq: 1, text: "Арагац", status: "excluded", addedByUserId: 1, addedByUsername: "anna", addedOn: "2026-03-01" },
    { id: "b", seq: 2, text: "Севан", status: "active", addedByUserId: 1, addedByUsername: "anna", addedOn: "2026-04-01" },
    { id: "c", seq: 3, text: "Дилижан", status: "rejected", addedByUserId: 2, addedByUsername: "boris", addedOn: "2026-04-02" },
  ],
  trips: [{ pollId: "p1", suggestionId: "a", tripDate: "2026-06-13", optionSuggestionIds: ["a", "b", null] }],
  votes: [
    { pollId: "p1", userId: 2, username: "boris", hasUsername: true, optionIndexes: [0] },
    { pollId: "p1", userId: 3, username: "Вика", hasUsername: false, optionIndexes: [1] },
  ],
  archive: [
    { suggestionId: "a", addedByUserId: 3, addedByUsername: "Вика", addedByHasUsername: false, addedOn: "2026-06-14" },
    { suggestionId: "a", addedByUserId: 3, addedByUsername: "Вика", addedByHasUsername: false, addedOn: "2026-06-14" },
    { suggestionId: "a", addedByUserId: 1, addedByUsername: "anna", addedByHasUsername: true, addedOn: "2025-06-14" },
  ],
};

test("topBy counts per key, most first, capped", () => {
  const ranked = topBy(["x", "y", "x", "z", "x", "y"], (s) => s.charCodeAt(0), (s) => s, 2);
  assert.deepEqual(ranked, [
    { label: "x", count: 3 },
    { label: "y", count: 2 },
  ]);
});

test("formatTop ranks the year's riders, idea authors and archivists", () => {
  assert.equal(
    formatTop(2026, input, 5),
    [
      "🏆 Рейтинг 2026 года",
      "",
      "Поездки:",
      "1. @boris — 1 поездка",
      "",
      "Идеи (одобренные):",
      "1. @anna — 2 идеи",
      "",
      "Пополнили архив (фото и сообщения):",
      "1. Вика — 2",
    ].join("\n"),
  );
});

test("formatTop for a quiet year nudges instead of printing empty lists", () => {
  assert.match(formatTop(2024, input, 5), /^В 2024 году рейтинга пока нет/);
});
