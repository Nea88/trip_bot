// Mandatory poll option meaning "I don't care / sit this one out" — always
// appended to every poll, on top of real suggestions. It can never win (see
// pollWinner.ts) — it exists so people can opt out without skewing which
// real destination wins.
export const MIMOKROKODIL_TEXT = "Мимокрокодил";

// Telegram caps polls at 10 options; this bot additionally always reserves
// one slot for the mandatory Мимокрокодил option.
export const MAX_POLL_OPTIONS_TOTAL = 8;
export const MAX_REAL_POLL_OPTIONS = MAX_POLL_OPTIONS_TOTAL - 1;

// Default text for the daily reminder to suggest a destination; overridable
// via /set_reminder_text, but shown as-is until an admin changes it.
export const DEFAULT_REMINDER_TEXT =
  "Куда бы вы хотели съездить в следующий раз? Если есть идея — напишите /suggest <куда>, например: /suggest на дачу. Посмотреть, что уже накидали — /list. Чем больше вариантов наберётся к следующему опросу, тем лучше!";
