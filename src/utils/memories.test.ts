import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { findAnniversaries, formatMemories } from "./memories.js";

const TZ = "Europe/Moscow";
const now = DateTime.fromISO("2026-09-28T12:00", { zone: TZ });
const day = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toJSDate();

test("finds trips on this day in earlier years, most recent first", () => {
  const result = findAnniversaries(
    [
      { suggestionId: "old", date: day("2023-09-28T18:00") },
      { suggestionId: "recent", date: day("2025-09-28T09:00") },
      { suggestionId: "this-year", date: day("2026-09-28T09:00") },
      { suggestionId: "yesterday", date: day("2025-09-27T09:00") },
    ],
    now,
    TZ,
  );
  assert.deepEqual(result, [
    { suggestionId: "recent", yearsAgo: 1 },
    { suggestionId: "old", yearsAgo: 3 },
  ]);
});

test("uses the group's timezone, not UTC", () => {
  // 22:30 UTC on Sep 27 is already Sep 28 in Moscow.
  const trip = { suggestionId: "late", date: new Date("2025-09-27T22:30:00Z") };
  assert.deepEqual(findAnniversaries([trip], now, TZ), [{ suggestionId: "late", yearsAgo: 1 }]);
});

test("formats links, caps them at 3 and escapes names", () => {
  const entry = (n: number) => ({ date: new Date(), what: `${n} фото`, author: "@a", link: `https://t.me/c/1/${n}` });
  const text = formatMemories([
    { seq: 12, text: "Дача <у озера>", yearsAgo: 2, entries: [1, 2, 3, 4].map(entry) },
  ]);
  assert.match(text, /^📅 В этот день\n\n2 года назад мы ездили: #12 Дача &lt;у озера&gt;/);
  assert.match(text, /<a href="https:\/\/t\.me\/c\/1\/3">3 фото<\/a> от @a\nВесь архив: \/place 12/);
  assert.doesNotMatch(text, /t\.me\/c\/1\/4/);
});

test("without photos invites to add them", () => {
  const text = formatMemories([{ seq: 5, text: "Озеро", yearsAgo: 5, entries: [] }]);
  assert.match(text, /5 лет назад мы ездили: #5 Озеро\nФото с той поездки в архиве нет — .*\/photo 5/);
});
