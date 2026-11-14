import { test } from "node:test";
import assert from "node:assert/strict";
import { geocodeQueries, normalizePlaceName, pointKind, routeGeoFresh, splitRoute } from "./routeText.js";

test("splitRoute: points around dashes, arrows and slashes", () => {
  assert.deepEqual(splitRoute("Семёновка — Гош"), ["Семёновка", "Гош"]);
  assert.deepEqual(splitRoute("Цовагюх - Гош"), ["Цовагюх", "Гош"]);
  assert.deepEqual(splitRoute("Ереван→Гарни"), ["Ереван", "Гарни"]);
  assert.deepEqual(splitRoute("Ереван -> Гарни"), ["Ереван", "Гарни"]);
  assert.deepEqual(splitRoute("Дилижан / Парз"), ["Дилижан", "Парз"]);
});

test("splitRoute: every via point is kept, in order", () => {
  assert.deepEqual(splitRoute("Ереван — Севан — Дилижан — Гош"), ["Ереван", "Севан", "Дилижан", "Гош"]);
});

test("splitRoute: one name is one point", () => {
  assert.deepEqual(splitRoute("Арагац"), ["Арагац"]);
});

test("splitRoute: hyphens without spaces and arrows typed any way", () => {
  for (const text of [
    "Семёновка-Гош",
    "Семёновка - Гош",
    "Семёновка->Гош",
    "Семёновка --> Гош",
    "Семёновка –> Гош",
    "Семёновка => Гош",
    "Семёновка → Гош",
    "Семёновка ⇒ Гош",
    "Семёновка ‑ Гош",
    "Семёновка−Гош",
    "Семёновка — Гош",
    "Семёновка > Гош",
  ]) {
    assert.deepEqual(splitRoute(text), ["Семёновка", "Гош"], text);
  }
  assert.deepEqual(splitRoute("Ереван-Севан->Дилижан"), ["Ереван", "Севан", "Дилижан"]);
  // Stray separators at the ends don't make empty points.
  assert.deepEqual(splitRoute("- Ереван - Гарни -"), ["Ереван", "Гарни"]);
});

test("splitRoute: drops brackets and quotes", () => {
  assert.deepEqual(splitRoute("Арагац (северная вершина)"), ["Арагац"]);
  assert.deepEqual(splitRoute("«Озеро Парз» — Гош"), ["Озеро Парз", "Гош"]);
  assert.deepEqual(splitRoute("  (?)  "), []);
});

test("pointKind: first is the start, last the finish, the rest via points", () => {
  assert.equal(pointKind(0, 1), "start");
  assert.deepEqual([0, 1, 2, 3].map((i) => pointKind(i, 4)), ["start", "via", "via", "finish"]);
});

test("normalizePlaceName: case, ё and spaces don't matter", () => {
  assert.equal(normalizePlaceName("  Семёновка  "), normalizePlaceName("семеновка"));
  assert.equal(normalizePlaceName("Озеро   Парз"), "озеро парз");
});

test("geocodeQueries: retries without words like «озеро»", () => {
  assert.deepEqual(geocodeQueries("Озеро Парз"), ["Озеро Парз", "Парз"]);
  assert.deepEqual(geocodeQueries("перевал Сулема"), ["перевал Сулема", "Сулема"]);
  assert.deepEqual(geocodeQueries("Гош"), ["Гош"]);
  assert.deepEqual(geocodeQueries("Горис"), ["Горис"]);
  assert.deepEqual(geocodeQueries("Озеро"), ["Озеро"]);
});

test("routeGeoFresh: same text split the same way", () => {
  const geo = { sourceText: "Семёновка-Гош", names: ["Семёновка", "Гош"], points: [null, null] };
  assert.ok(routeGeoFresh("Семёновка-Гош", geo));
  assert.ok(!routeGeoFresh("Семёновка — Гош", geo), "text changed");
  // Saved before hyphens split: one point named after the whole text.
  assert.ok(!routeGeoFresh("Семёновка-Гош", { sourceText: "Семёновка-Гош", names: ["Семёновка-Гош"], points: [null] }));
  // The 1.21.0 format.
  assert.ok(!routeGeoFresh("Гош", { sourceText: "Гош" }));
  assert.ok(!routeGeoFresh("Гош", undefined));
});
