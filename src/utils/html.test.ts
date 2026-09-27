import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "./html.js";

test("escapeHtml neutralizes Telegram HTML special characters", () => {
  assert.equal(escapeHtml(`<b>"Дача" & озеро</b>`), "&lt;b&gt;&quot;Дача&quot; &amp; озеро&lt;/b&gt;");
  assert.equal(escapeHtml("на дачу"), "на дачу");
});
