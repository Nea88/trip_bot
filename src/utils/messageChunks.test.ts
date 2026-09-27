import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkLines } from "./messageChunks.js";

test("short lists stay in one message", () => {
  assert.deepEqual(chunkLines(["a", "b"]), ["a\nb"]);
});

test("empty input gives no messages", () => {
  assert.deepEqual(chunkLines([]), []);
});

test("long lists split on line boundaries within the limit", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `#${i}: ${"x".repeat(90)}`);
  const chunks = chunkLines(lines);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 4096);
  assert.equal(chunks.join("\n"), lines.join("\n"));
});
