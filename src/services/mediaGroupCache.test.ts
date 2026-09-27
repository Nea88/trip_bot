import { test } from "node:test";
import assert from "node:assert/strict";
import { MediaGroupCache } from "./mediaGroupCache.js";

const photo = (messageId: number) => ({
  messageId,
  fileId: `f${messageId}`,
  fileUniqueId: `u${messageId}`,
});

test("collects an album's photos in message order without duplicates", () => {
  const cache = new MediaGroupCache();
  cache.add("g", photo(3));
  cache.add("g", photo(1));
  cache.add("g", photo(3));
  assert.deepEqual(cache.get("g").map((p) => p.messageId), [1, 3]);
  assert.deepEqual(cache.get("unknown"), []);
});

test("albums expire after the TTL", () => {
  let now = 0;
  const cache = new MediaGroupCache(1000, 10, () => now);
  cache.add("g", photo(1));
  now = 999;
  assert.equal(cache.get("g").length, 1);
  now = 1000;
  assert.deepEqual(cache.get("g"), []);
});

test("drops the oldest album when full", () => {
  const cache = new MediaGroupCache(1000, 2);
  cache.add("a", photo(1));
  cache.add("b", photo(2));
  cache.add("c", photo(3));
  assert.deepEqual(cache.get("a"), []);
  assert.equal(cache.get("b").length, 1);
  assert.equal(cache.get("c").length, 1);
});
