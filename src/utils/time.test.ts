import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidTime, isValidTimezone, parseDayOfWeek, parseTime } from "./time.js";

test("parseDayOfWeek accepts full and short names, any case", () => {
  assert.equal(parseDayOfWeek("sunday"), 0);
  assert.equal(parseDayOfWeek("Fri"), 5);
  assert.equal(parseDayOfWeek(" THURS "), 4);
  assert.equal(parseDayOfWeek("пятница"), null);
  assert.equal(parseDayOfWeek(""), null);
});

test("isValidTime requires zero-padded 24h HH:MM", () => {
  assert.equal(isValidTime("00:00"), true);
  assert.equal(isValidTime("23:59"), true);
  assert.equal(isValidTime("24:00"), false);
  assert.equal(isValidTime("9:30"), false);
  assert.equal(isValidTime("12:60"), false);
});

test("parseTime returns numeric parts", () => {
  assert.deepEqual(parseTime("07:05"), { hour: 7, minute: 5 });
  assert.equal(parseTime("7:5"), null);
});

test("isValidTimezone checks IANA names", () => {
  assert.equal(isValidTimezone("Europe/Moscow"), true);
  assert.equal(isValidTimezone("UTC"), true);
  assert.equal(isValidTimezone("Mars/Olympus"), false);
});
