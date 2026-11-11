import { test } from "node:test";
import assert from "node:assert/strict";
import { geocodeQueries, splitRoute } from "./routeText.js";

test("splitRoute: start and finish around a dash or arrow", () => {
  assert.deepEqual(splitRoute("Семёновка — Гош"), { start: "Семёновка", finish: "Гош" });
  assert.deepEqual(splitRoute("Цовагюх - Гош"), { start: "Цовагюх", finish: "Гош" });
  assert.deepEqual(splitRoute("Ереван→Гарни"), { start: "Ереван", finish: "Гарни" });
  assert.deepEqual(splitRoute("Ереван -> Гарни"), { start: "Ереван", finish: "Гарни" });
  assert.deepEqual(splitRoute("Дилижан / Парз"), { start: "Дилижан", finish: "Парз" });
});

test("splitRoute: via points are skipped, the last part is the finish", () => {
  assert.deepEqual(splitRoute("Ереван — Севан — Дилижан"), { start: "Ереван", finish: "Дилижан" });
});

test("splitRoute: one name is one point; hyphenated names stay whole", () => {
  assert.deepEqual(splitRoute("Арагац"), { start: "Арагац", finish: null });
  assert.deepEqual(splitRoute("Ай-Петри"), { start: "Ай-Петри", finish: null });
});

test("splitRoute: drops brackets and quotes", () => {
  assert.deepEqual(splitRoute("Арагац (северная вершина)"), { start: "Арагац", finish: null });
  assert.deepEqual(splitRoute("«Озеро Парз» — Гош"), { start: "Озеро Парз", finish: "Гош" });
  assert.equal(splitRoute("  (?)  "), null);
});

test("geocodeQueries: retries without words like «озеро»", () => {
  assert.deepEqual(geocodeQueries("Озеро Парз"), ["Озеро Парз", "Парз"]);
  assert.deepEqual(geocodeQueries("перевал Сулема"), ["перевал Сулема", "Сулема"]);
  assert.deepEqual(geocodeQueries("Гош"), ["Гош"]);
  assert.deepEqual(geocodeQueries("Горис"), ["Горис"]);
  assert.deepEqual(geocodeQueries("Озеро"), ["Озеро"]);
});
