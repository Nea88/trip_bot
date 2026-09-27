import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSuggestionText, validateSuggestionText } from "./suggestionText.js";

test("normalizeSuggestionText trims, lowercases and collapses whitespace", () => {
  assert.equal(normalizeSuggestionText("  На   Дачу \n"), "на дачу");
});

test("validateSuggestionText accepts a normal place", () => {
  assert.equal(validateSuggestionText("на дачу"), null);
});

test("validateSuggestionText rejects junk", () => {
  assert.notEqual(validateSuggestionText("ab"), null);
  assert.notEqual(validateSuggestionText("x".repeat(101)), null);
  assert.notEqual(validateSuggestionText("/suggest куда-то"), null);
  assert.notEqual(validateSuggestionText("😀 😀 😀"), null);
});

test("validateSuggestionText allows exactly 100 characters", () => {
  assert.equal(validateSuggestionText("x".repeat(100)), null);
});
