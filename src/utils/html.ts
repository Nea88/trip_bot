// Escapes user text for Telegram's HTML parse mode.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Tags Telegram accepts with parse_mode "HTML"; anything else starting with
// "<" (e.g. "<ссылка>") makes it reject the whole message.
const TELEGRAM_HTML_TAGS = new Set([
  "a", "b", "strong", "i", "em", "u", "ins", "s", "strike", "del",
  "span", "tg-spoiler", "tg-emoji", "code", "pre", "blockquote",
]);

/** Throws like Telegram does on HTML it can't parse. */
export function assertTelegramHtml(text: string): void {
  for (let i = text.indexOf("<"); i !== -1; i = text.indexOf("<", i + 1)) {
    const tag = /^<\/?([a-zA-Z-]+)(?:\s[^<>]*)?>/.exec(text.slice(i));
    if (!tag || !TELEGRAM_HTML_TAGS.has(tag[1].toLowerCase())) {
      throw new Error(`Bad Request: can't parse entities: Unsupported start tag at offset ${i} in: ${text}`);
    }
  }
}
