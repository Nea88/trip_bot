import { test } from "node:test";
import assert from "node:assert/strict";
import { groupArchive, type ArchiveItem } from "./placeArchive.js";

const CHAT = -1001234;
const item = (batchId: string, messageId: number, day: number, overrides: Partial<ArchiveItem> = {}): ArchiveItem => ({
  batchId,
  fileId: `f${messageId}`,
  sourceChatId: CHAT,
  sourceMessageId: messageId,
  addedAt: new Date(2026, 8, day),
  addedByUsername: "vasya",
  addedByHasUsername: true,
  ...overrides,
});

test("an album becomes one entry linking to its first photo", () => {
  const entries = groupArchive([item("a", 12, 1), item("a", 11, 1), item("a", 13, 1)]);
  assert.deepEqual(entries, [
    { date: new Date(2026, 8, 1), what: "3 фото", author: "@vasya", link: "https://t.me/c/1234/11" },
  ]);
});

test("separate submissions stay separate, oldest first", () => {
  const entries = groupArchive([
    item("late", 50, 20, { fileId: null, addedByUsername: "Петя", addedByHasUsername: false }),
    item("early", 10, 5),
  ]);
  assert.deepEqual(
    entries.map((e) => [e.what, e.author, e.link]),
    [
      ["1 фото", "@vasya", "https://t.me/c/1234/10"],
      ["1 сообщение", "Петя", "https://t.me/c/1234/50"],
    ],
  );
});

test("empty archive gives no entries", () => {
  assert.deepEqual(groupArchive([]), []);
});
