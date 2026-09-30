import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSummary, isValidScore, ratingPromptText, servantBadge, summarize } from "./servantScale.js";

test("scores are whole numbers from 1 to 5", () => {
  assert.ok(isValidScore(1) && isValidScore(5));
  assert.ok(!isValidScore(0) && !isValidScore(6) && !isValidScore(2.5) && !isValidScore(NaN));
});

test("summary averages the scores and formats with one decimal", () => {
  assert.equal(summarize([]), null);
  assert.equal(formatSummary(summarize([3, 4, 4])!), "3.7 из 5 (3 оценки)");
  assert.equal(formatSummary(summarize([4])!), "4 из 5 (1 оценка)");
  assert.equal(formatSummary(summarize([1, 2, 3, 4, 5])!), "3 из 5 (5 оценок)");
});

test("badge for /list only when rated", () => {
  assert.equal(servantBadge(null), "");
  assert.equal(servantBadge(summarize([2, 3])), " 🚙2.5");
});

test("rating prompt lists the scale and the current average", () => {
  const empty = ratingPromptText("Арагац", null);
  assert.match(empty, /^🚙 Ну что, сервант справился\? Оцените сервантопроходимость маршрута «Арагац» \(Honda CR-V в вакууме\):\n1 — «я же кроссовер», — сказал сервант и остался на асфальте/);
  assert.match(empty, /5 — асфальт до самого крыльца — естественная среда обитания серванта\n\nОценок пока нет\.$/);
  assert.match(ratingPromptText("Арагац", summarize([5, 4])), /Средняя: 4\.5 из 5 \(2 оценки\)$/);
});
