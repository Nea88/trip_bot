import { test } from "node:test";
import assert from "node:assert/strict";
import type { PhotoSize } from "grammy/types";
import { buildMessageLink, chunk, largestPhoto, photoBadge } from "./photoMessage.js";

const size = (id: string, width: number): PhotoSize => ({
  file_id: id,
  file_unique_id: `u${id}`,
  width,
  height: width,
});

test("largestPhoto picks the last (biggest) size", () => {
  assert.equal(largestPhoto({ photo: [size("s", 90), size("m", 320), size("l", 1280)] })?.file_id, "l");
});

test("largestPhoto returns null without a photo", () => {
  assert.equal(largestPhoto({}), null);
  assert.equal(largestPhoto({ photo: [] }), null);
});

test("buildMessageLink strips the supergroup -100 prefix", () => {
  assert.equal(buildMessageLink(-1001234567890, 42), "https://t.me/c/1234567890/42");
});

test("chunk splits into groups of the given size", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 10), []);
});

test("photoBadge only shows for a positive count", () => {
  assert.equal(photoBadge(undefined), "");
  assert.equal(photoBadge(0), "");
  assert.equal(photoBadge(7), " 📷 7");
});
