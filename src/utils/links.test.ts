import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLinks, normalizeUrl, parseAddLink } from "./links.js";

test("parseAddLink splits the URL from the description", () => {
  assert.deepEqual(parseAddLink("  https://example.com/map   Карта   заправок "), {
    url: "https://example.com/map",
    description: "Карта заправок",
  });
});

test("parseAddLink explains what's wrong", () => {
  assert.match((parseAddLink("") as { error: string }).error, /Использование/);
  assert.match((parseAddLink("https://example.com") as { error: string }).error, /Использование/);
  assert.match((parseAddLink("example.com Карта") as { error: string }).error, /Не похоже на ссылку/);
  assert.match((parseAddLink("ftp://example.com Карта") as { error: string }).error, /http:\/\//);
  assert.match((parseAddLink("https://example.com ок") as { error: string }).error, /Добавьте описание/);
  assert.match((parseAddLink(`https://example.com ${"x".repeat(201)}`) as { error: string }).error, /Слишком длинное/);
});

test("normalizeUrl treats trivially different URLs as the same", () => {
  const same = ["https://www.Example.com/map/", "http://example.com/map", "https://example.com/map#top"];
  assert.deepEqual(new Set(same.map(normalizeUrl)).size, 1);
  assert.notEqual(normalizeUrl("https://example.com/map?a=1"), normalizeUrl("https://example.com/map"));
});

test("formatLinks lists links as clickable descriptions, escaped", () => {
  assert.deepEqual(formatLinks([{ seq: 3, url: "https://a.com/?x=1&y=2", description: "Карта <новая>" }]), [
    "🔗 Полезные ссылки группы:",
    '#3 <a href="https://a.com/?x=1&amp;y=2">Карта &lt;новая&gt;</a>',
    "",
    "Предложить свою: /addlink <ссылка> <описание>",
  ]);
  assert.equal(formatLinks([])[0], "Полезных ссылок пока нет.");
});
