// Mandatory poll option meaning "I don't care / sit this one out" — always
// appended to every poll, on top of real suggestions.
export const MIMOKROKODIL_TEXT = "Мимокрокодил";

// Sentinel used in place of a suggestion doc id (in optionSuggestionIds and in
// callback_data) to represent the mandatory option, which isn't backed by a
// suggestion document.
export const MIMOKROKODIL_TOKEN = "skip";

// Telegram caps polls at 10 options; this bot additionally always reserves
// one slot for the mandatory Мимокрокодил option.
export const MAX_POLL_OPTIONS_TOTAL = 8;
export const MAX_REAL_POLL_OPTIONS = MAX_POLL_OPTIONS_TOTAL - 1;

// Default text for the daily reminder to suggest a destination; overridable
// via /set_reminder_text, but shown as-is until an admin changes it.
export const DEFAULT_REMINDER_TEXT =
  "Куда бы вы хотели съездить в следующий раз? Если есть идея — напишите /suggest <куда>, например: /suggest на дачу. Посмотреть, что уже накидали — /list. Чем больше вариантов наберётся к следующему опросу, тем лучше!";
