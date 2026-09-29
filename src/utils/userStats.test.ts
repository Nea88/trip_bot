import { test } from "node:test";
import assert from "node:assert/strict";
import { formatUserStats } from "./userStats.js";

const s = (id: string, userId: number, status: "active" | "excluded" | "pending" | "rejected", text = id) => ({
  id,
  addedByUserId: userId,
  status,
  text,
});

test("full stats: trips joined, ideas and trips to them, archive, waiting", () => {
  const text = formatUserStats(1, "@vasya", {
    suggestions: [
      s("a", 1, "active"),
      s("b", 1, "excluded", "Дача"),
      s("c", 1, "pending"),
      s("d", 1, "rejected"),
      s("e", 2, "excluded", "Озеро"),
    ],
    trips: [
      { pollId: "p1", suggestionId: "b", tripDate: "2026-09-26", optionSuggestionIds: ["b", "a", null] },
      { pollId: "p2", suggestionId: "e", tripDate: "2026-09-19", optionSuggestionIds: ["e", null] },
    ],
    // vasya voted for Озеро (went) but Мимокрокодил in p1 (skipped his own idea's trip).
    votes: [
      { pollId: "p2", userId: 1, username: "vasya", hasUsername: true, optionIndexes: [0] },
      { pollId: "p1", userId: 1, username: "vasya", hasUsername: true, optionIndexes: [2] },
    ],
    archive: [
      { fileId: "f1", status: "approved" },
      { fileId: null, status: "approved" },
      { fileId: "f2", status: "pending" },
      { fileId: "f3", status: "rejected" },
    ],
  });
  assert.equal(
    text,
    [
      "Статистика @vasya:",
      "Поездки: 1 — 19.09.2026 «Озеро»",
      "Идеи: 2 (в пуле — 1, уже не в пуле — 1)",
      "Съездили по вашим идеям: 1 — 26.09.2026 «Дача»",
      "В архиве от вас: 1 фото и 1 сообщение",
      "Ждут модерации: 1 предложение и 1 фото",
    ].join("\n"),
  );
});

test("a newcomer gets nudges instead of zeros", () => {
  assert.equal(
    formatUserStats(3, "Петя", { suggestions: [], trips: [], votes: [], archive: [] }),
    [
      "Статистика Петя:",
      "Поездок пока нет (считаются по голосу в опросе за место, куда в итоге съездили).",
      "Идей пока нет — предложите: /suggest <куда>",
      "В архиве от вас пока ничего нет.",
    ].join("\n"),
  );
});
