// Mandatory poll option meaning "I don't care / sit this one out" — always
// appended to every poll, on top of real suggestions. It can never win (see
// pollWinner.ts) — it exists so people can opt out without skewing which
// real destination wins.
export const MIMOKROKODIL_TEXT = "Мимокрокодил";

// Telegram caps polls at 10 options; one slot is always reserved for the
// mandatory Мимокрокодил option, leaving 9 for real suggestions.
export const MAX_POLL_OPTIONS_TOTAL = 10;
export const MAX_REAL_POLL_OPTIONS = MAX_POLL_OPTIONS_TOTAL - 1;

// Default text for the every-other-day reminder to suggest a destination; overridable
// via /set_reminder_text, but shown as-is until an admin changes it.
export const DEFAULT_REMINDER_TEXT =
  "Куда поедем в следующий раз? Есть идея — напишите /suggest <куда>, например: /suggest Арагац. Что уже предложили — /list. Чем больше вариантов к следующему опросу, тем лучше!\n\n" +
  "📸 После поездки сохраняйте фото: ответьте на сообщение с фото командой /photo <номер места> — оно попадёт в архив места (/place <номер>).\n" +
  "🏍 Ваша статистика — /me, история поездок — /history.";

// Welcome for new group members, after "👋 Добро пожаловать, <имена>!".
// Overridable with /set_welcome_text.
export const DEFAULT_WELCOME_TEXT =
  "Здесь мы вместе выбираем, куда поехать в субботу:\n" +
  "• /suggest <куда> — предложить место; каждую неделю бот запускает опрос, голосуйте — по голосу бот понимает, кто ездил\n" +
  "• в пятницу бот публикует точку и время старта, в субботу утром — напоминание с погодой\n" +
  "• после поездки ответьте на свои фото командой /photo <номер места> — они сохранятся в архиве\n\n" +
  "🔗 Полезные ссылки группы — /links. Знаете полезную ссылку? Предложите: /addlink <ссылка> <описание> — после проверки админом она появится в списке.\n\n" +
  "Все команды — /help";
