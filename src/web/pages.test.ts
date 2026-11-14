import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPointsPage, type PlaceRow } from "./pages.js";

const route: PlaceRow = {
  id: "a",
  seq: 3,
  text: "Цовагюх — <Тайник> — Гош",
  status: "active",
  routeGeo: {
    sourceText: "Цовагюх — <Тайник> — Гош",
    names: ["Цовагюх", "<Тайник>", "Гош"],
    points: [{ lat: 40.632, lon: 44.9583 }, null, { lat: 40.7297, lon: 44.9958 }],
  },
};

const render = (places: PlaceRow[], manual: string[] = [], message: string | null = null) =>
  renderPointsPage({ places, manual: new Set(manual), message, formToken: "tok" });

test("points page: roles, coordinates, missing points, escaped names", () => {
  const page = render([route]);
  assert.match(page, /<td class="kind">старт<\/td>\s*<td>Цовагюх<\/td>\s*<td class="coords">40\.63200, 44\.95830/);
  assert.match(page, /<td class="kind">через<\/td>\s*<td>&lt;Тайник&gt;<\/td>\s*<td class="coords"><span class="missing">не найдено/);
  assert.match(page, /<td class="kind">финиш<\/td>/);
  assert.doesNotMatch(page, /<Тайник>/);
  assert.match(page, /name="token" value="tok"/);
  assert.match(page, /href="preview\/a\.png"/);
});

test("points page: reset only for points set by hand", () => {
  assert.doesNotMatch(render([route]), /Сбросить/);
  const page = render([route], ["гош"]);
  assert.equal(page.match(/value="reset"/g)?.length, 1);
  assert.match(page, /указано вручную/);
});

test("points page: links and forms are relative, for Ingress", () => {
  const page = render([route]);
  assert.doesNotMatch(page, /(href|action)="\//);
  assert.match(page, /action="points"/);
});

test("points page: places not looked up yet, stale ones, hidden statuses, message", () => {
  const page = render(
    [
      { id: "b", seq: 4, text: "Арагац", status: "active" },
      { ...route, id: "c", seq: 5, text: "Цовагюх — Гош" },
      { id: "d", seq: 6, text: "ждёт", status: "pending" },
      { id: "e", seq: 7, text: "отказ", status: "rejected" },
    ],
    [],
    "Готово & сохранено",
  );
  assert.match(page, /#4 Арагац[\s\S]*Точки ещё не искали[\s\S]*Найти точки</);
  assert.match(page, /#5 Цовагюх — Гош[\s\S]*Название изменилось[\s\S]*Найти точки заново/);
  assert.doesNotMatch(page, /ждёт|отказ/);
  assert.match(page, /Готово &amp; сохранено/);
});

test("points page: active places first, newest first", () => {
  const page = render([
    { id: "x", seq: 1, text: "старое", status: "excluded" },
    { id: "y", seq: 2, text: "второе", status: "active" },
    { id: "z", seq: 9, text: "новое", status: "active" },
  ]);
  const at = (s: string) => page.indexOf(s);
  assert.ok(at("#9 новое") < at("#2 второе") && at("#2 второе") < at("#1 старое"));
});
