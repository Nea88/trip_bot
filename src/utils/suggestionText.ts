// Telegram poll option text is capped at 100 characters; suggestions become
// poll options, so this must be enforced before a suggestion is ever accepted.
const MAX_SUGGESTION_LENGTH = 100;
const MIN_SUGGESTION_LENGTH = 3;

// Emoji/symbols count toward .length just like letters do, so "😀 😀" passes
// the length check despite carrying no actual place name — require at least
// one real letter or digit (any script) somewhere in the text.
const HAS_ALPHANUMERIC = /[\p{L}\p{N}]/u;

/**
 * Returns an error message if the text isn't a valid suggestion, or null if
 * it's fine. Shared between /suggest and /edit so both reject the same junk:
 * too short, too long, only whitespace/emoji, or itself a slash command (e.g.
 * someone pasting "/suggest /suggest куда-то" ends up with match text
 * "/suggest куда-то").
 */
export function validateSuggestionText(text: string): string | null {
  if (text.length < MIN_SUGGESTION_LENGTH) {
    return `Слишком коротко (минимум ${MIN_SUGGESTION_LENGTH} символа).`;
  }
  if (text.length > MAX_SUGGESTION_LENGTH) {
    return `Слишком длинно (максимум ${MAX_SUGGESTION_LENGTH} символов) — сократите текст.`;
  }
  if (text.startsWith("/")) {
    return "Текст варианта не должен начинаться с команды (/...) — похоже, команда продублирована.";
  }
  if (!HAS_ALPHANUMERIC.test(text)) {
    return "Нужен текст с буквами или цифрами, а не только пробелы/эмодзи.";
  }
  return null;
}
