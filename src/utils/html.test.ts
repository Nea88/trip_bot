import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTelegramHtml, escapeHtml } from "./html.js";
import { formatLinks } from "./links.js";
import { formatMemories } from "./memories.js";
import { mentionHtml } from "./userName.js";

test("escapeHtml neutralizes Telegram HTML special characters", () => {
  assert.equal(escapeHtml(`<b>"Дача" & озеро</b>`), "&lt;b&gt;&quot;Дача&quot; &amp; озеро&lt;/b&gt;");
  assert.equal(escapeHtml("на дачу"), "на дачу");
});

test("assertTelegramHtml passes Telegram's tags and rejects anything else", () => {
  assertTelegramHtml('#3 <a href="https://a.com">Карта</a> <b>жирно</b> &lt;ссылка&gt;');
  assertTelegramHtml('<tg-spoiler>тайна</tg-spoiler> <span class="tg-spoiler">и тут</span>');
  assert.throws(() => assertTelegramHtml("/addlink <ссылка> <описание>"), /can't parse entities/);
  assert.throws(() => assertTelegramHtml("<br>"), /can't parse entities/);
  assert.throws(() => assertTelegramHtml("1 < 2"), /can't parse entities/);
});

// Pure formatters whose output goes out with parse_mode "HTML", fed hostile text.
test("HTML formatters stay valid for Telegram whatever the user text", () => {
  const nasty = `<script> & "кавычки" <ссылка>`;
  for (const line of [...formatLinks([]), ...formatLinks([{ seq: 1, url: `https://a.com/?q=<x>&y="1"`, description: nasty }])]) {
    assertTelegramHtml(line);
  }
  assertTelegramHtml(
    formatMemories([
      { seq: 1, text: nasty, yearsAgo: 1, entries: [{ date: new Date(), what: nasty, author: nasty, link: "https://t.me/c/1/2" }] },
      { seq: 2, text: nasty, yearsAgo: 3, entries: [] },
    ]),
  );
  assertTelegramHtml(mentionHtml(7, nasty));
});
