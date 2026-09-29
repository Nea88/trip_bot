import type { BotCommand } from "grammy/types";

export interface CommandSpec {
  command: string;
  // Short description for Telegram's command menu.
  menu: string;
  // Line in /help.
  help: string;
  audience: "all" | "admin";
  // Where the command works: only the group, only a DM with the bot, or both.
  where: "group" | "dm" | "any";
}

/**
 * Single source of truth for commands: bot.ts registers handlers from it
 * (with the matching middleware), commands.ts builds the Telegram menus and
 * help.ts the /help text. Order here is the order in menus and help.
 */
export const COMMANDS = [
  { command: "suggest", menu: "Предложить вариант маршрута", audience: "all", where: "group",
    help: "/suggest <куда> — предложить вариант маршрута (в группе). Уходит на рассмотрение админу, появится в списке после одобрения" },
  { command: "list", menu: "Текущие варианты маршрутов", audience: "all", where: "group",
    help: "/list — посмотреть текущие (уже одобренные) варианты (в группе)" },
  { command: "photo", menu: "Прикрепить фото (ответом) к месту", audience: "all", where: "group",
    help: "/photo <номер> — ответом на сообщение (фото, альбом, видео, текст — что угодно) прикрепить его к месту, где были. Уходит на модерацию админу" },
  { command: "place", menu: "Фото и поездки по месту", audience: "all", where: "group",
    help: "/place <номер> — даты поездок и ссылки на фото и сообщения из архива места (в группе)" },
  { command: "history", menu: "Прошлые поездки и статистика", audience: "all", where: "group",
    help: "/history — прошлые поездки, самые активные авторы идей и варианты, которые чаще всего проигрывали (в группе)" },
  { command: "year", menu: "Итоги года", audience: "all", where: "group",
    help: "/year [год] — итоги года: поездки, лидеры по идеям и по архиву (в группе). 31 декабря бот публикует их сам" },
  { command: "me", menu: "Моя статистика", audience: "all", where: "any",
    help: "/me — ваша статистика: поездки (по голосу в опросе за место, куда съездили), идеи, что вы добавили в архив" },
  { command: "start", menu: "Подписаться на DM-уведомления", audience: "all", where: "dm",
    help: "/start — в личных сообщениях боту, чтобы получать уведомления о новых предложениях (актуально для админов)" },
  { command: "help", menu: "Список команд", audience: "all", where: "any",
    help: "/help — этот список" },

  { command: "pending", menu: "Что ждёт модерации", audience: "admin", where: "any",
    help: "/pending — предложения и фото, которые ждут решения, с кнопками одобрения" },
  { command: "unphoto", menu: "Убрать фото (ответом) из архива", audience: "admin", where: "group",
    help: "/unphoto — ответом на фото или исходное сообщение убрать его из архива места" },
  { command: "edit", menu: "Изменить текст варианта", audience: "admin", where: "any",
    help: "/edit <номер> <текст> — изменить текст варианта" },
  { command: "delete", menu: "Удалить вариант навсегда", audience: "admin", where: "any",
    help: "/delete <номер> — удалить вариант навсегда" },
  { command: "exclude", menu: "Исключить вариант из пула", audience: "admin", where: "any",
    help: "/exclude <номер> — вручную исключить активный вариант из пула" },
  { command: "restore", menu: "Вернуть исключённый вариант в пул", audience: "admin", where: "any",
    help: "/restore <номер> — вернуть исключённый вариант в пул" },
  { command: "excluded", menu: "Список исключённых вариантов", audience: "admin", where: "any",
    help: "/excluded — список исключённых (использованных) вариантов" },
  { command: "create_poll", menu: "Создать опрос сейчас", audience: "admin", where: "any",
    help: "/create_poll — создать опрос прямо сейчас" },
  { command: "meet", menu: "Точка и время старта субботней поездки", audience: "admin", where: "any",
    help: "/meet <ЧЧ:ММ> <точка> — точка и время старта субботней поездки (до 20:00 пятницы), публикуется в группе. Ответом на геолокацию — ещё точка на карте и прогноз погоды" },
  { command: "close_poll", menu: "Закрыть опрос и подтвердить, куда съездили", audience: "admin", where: "group",
    help: "/close_poll — закрыть текущий опрос и подтвердить, куда съездили" },
  { command: "cancel_poll", menu: "Закрыть опрос без подсчёта результатов", audience: "admin", where: "group",
    help: "/cancel_poll — закрыть текущий опрос без подсчёта результатов (место не исключается)" },
  { command: "get_open_poll", menu: "Ссылка на текущий открытый опрос", audience: "admin", where: "any",
    help: "/get_open_poll — получить ссылку на текущий открытый опрос" },
  { command: "set_schedule", menu: "Настроить автосоздание опроса", audience: "admin", where: "any",
    help: "/set_schedule <день> <ЧЧ:ММ> — расписание автосоздания опроса" },
  { command: "set_close_schedule", menu: "Настроить автозакрытие опроса", audience: "admin", where: "any",
    help: "/set_close_schedule <день> <ЧЧ:ММ> — расписание автозакрытия опроса, например sunday 12:00" },
  { command: "get_schedule", menu: "Расписание создания и закрытия опроса", audience: "admin", where: "any",
    help: "/get_schedule — расписание создания и закрытия опроса" },
  { command: "set_reminder_time", menu: "Настроить время памятки про /suggest", audience: "admin", where: "any",
    help: "/set_reminder_time <ЧЧ:ММ> — время памятки про /suggest (приходит через день)" },
  { command: "set_reminder_text", menu: "Задать текст памятки", audience: "admin", where: "any",
    help: "/set_reminder_text <текст> — свой текст для памятки" },
  { command: "get_reminder", menu: "Посмотреть время и текст памятки", audience: "admin", where: "any",
    help: "/get_reminder — посмотреть текущее время и текст памятки" },
  { command: "backup", menu: "Резервная копия базы (файлом)", audience: "admin", where: "dm",
    help: "/backup — прислать резервную копию базы файлом (в личных сообщениях). Раз в неделю копия приходит сама" },
] as const satisfies readonly CommandSpec[];

export type CommandName = (typeof COMMANDS)[number]["command"];

const specs: readonly CommandSpec[] = COMMANDS;
const toMenu = (list: readonly CommandSpec[]): BotCommand[] =>
  list.map(({ command, menu }) => ({ command, description: menu }));

// /help goes last in every menu.
function helpLast(list: readonly CommandSpec[]): BotCommand[] {
  return toMenu([...list.filter((c) => c.command !== "help"), ...list.filter((c) => c.command === "help")]);
}

export type MenuScope = "private" | "group" | "groupAdmin" | "privateAdmin";

export function menuFor(scope: MenuScope): BotCommand[] {
  const forAll = specs.filter((c) => c.audience === "all");
  const inGroup = (c: CommandSpec) => c.where !== "dm";
  const inDm = (c: CommandSpec) => c.where !== "group";
  switch (scope) {
    case "private":
      return helpLast(forAll.filter(inDm));
    case "group":
      return helpLast(forAll.filter(inGroup));
    case "groupAdmin":
      return helpLast(specs.filter(inGroup));
    case "privateAdmin":
      // Admin tools first; /start stays reachable at the end.
      return toMenu([
        ...specs.filter((c) => c.audience === "admin" && inDm(c)),
        ...forAll.filter((c) => inDm(c) && c.command !== "start"),
        ...forAll.filter((c) => c.command === "start"),
      ]);
  }
}

export function helpText(isAdmin: boolean): string {
  const userLines = specs.filter((c) => c.audience === "all").map((c) => c.help);
  const userText = ["Команды:", ...userLines].join("\n");
  if (!isAdmin) return userText;
  const adminLines = specs.filter((c) => c.audience === "admin").map((c) => c.help);
  return [
    userText,
    "",
    "Команды для админов группы:",
    "Одобрение/отклонение новых предложений и фото — кнопками прямо в DM-уведомлении, отдельной команды нет",
    ...adminLines,
  ].join("\n");
}
