import { test } from "node:test";
import assert from "node:assert/strict";
import { pluralRu } from "./plural.js";

const IDEAS: [string, string, string] = ["идея", "идеи", "идей"];

test("pluralRu picks the right Russian form", () => {
  assert.equal(pluralRu(1, IDEAS), "идея");
  assert.equal(pluralRu(21, IDEAS), "идея");
  assert.equal(pluralRu(3, IDEAS), "идеи");
  assert.equal(pluralRu(24, IDEAS), "идеи");
  assert.equal(pluralRu(0, IDEAS), "идей");
  assert.equal(pluralRu(5, IDEAS), "идей");
  assert.equal(pluralRu(11, IDEAS), "идей");
  assert.equal(pluralRu(14, IDEAS), "идей");
  assert.equal(pluralRu(112, IDEAS), "идей");
});
