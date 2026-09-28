import type { Api } from "grammy";
import type { BotCommand } from "grammy/types";
import { getAllRegistrations } from "../services/registrations.js";
import { isGroupAdmin } from "../services/adminAuth.js";

const START: BotCommand = { command: "start", description: "Подписаться на DM-уведомления" };
const HELP: BotCommand = { command: "help", description: "Список команд" };
const SUGGEST: BotCommand = { command: "suggest", description: "Предложить вариант маршрута" };
const LIST: BotCommand = { command: "list", description: "Текущие варианты маршрутов" };
const PHOTO: BotCommand = { command: "photo", description: "Прикрепить фото (ответом) к месту" };
const PLACE: BotCommand = { command: "place", description: "Фото и поездки по месту" };
const HISTORY: BotCommand = { command: "history", description: "Прошлые поездки и статистика" };

const ADMIN_ONLY: BotCommand[] = [
  { command: "edit", description: "Изменить текст варианта" },
  { command: "delete", description: "Удалить вариант навсегда" },
  { command: "exclude", description: "Исключить вариант из пула" },
  { command: "restore", description: "Вернуть исключённый вариант в пул" },
  { command: "excluded", description: "Список исключённых вариантов" },
  { command: "create_poll", description: "Создать опрос сейчас" },
  { command: "get_open_poll", description: "Ссылка на текущий открытый опрос" },
  { command: "meet", description: "Точка и время старта субботней поездки" },
  { command: "set_schedule", description: "Настроить автосоздание опроса" },
  { command: "set_close_schedule", description: "Настроить автозакрытие опроса" },
  { command: "get_schedule", description: "Расписание создания и закрытия опроса" },
  { command: "set_reminder_time", description: "Настроить время памятки про /suggest" },
  { command: "set_reminder_text", description: "Задать текст памятки" },
  { command: "get_reminder", description: "Посмотреть время и текст памятки" },
];

const PRIVATE_COMMANDS: BotCommand[] = [START, HELP];
const GROUP_COMMANDS: BotCommand[] = [SUGGEST, LIST, PHOTO, PLACE, HISTORY, HELP];
const GROUP_ADMIN_COMMANDS: BotCommand[] = [
  SUGGEST,
  LIST,
  PHOTO,
  PLACE,
  HISTORY,
  ...ADMIN_ONLY,
  { command: "unphoto", description: "Убрать фото (ответом) из архива" },
  { command: "close_poll", description: "Закрыть опрос и подтвердить, куда съездили" },
  { command: "cancel_poll", description: "Закрыть опрос без подсчёта результатов" },
  HELP,
];
const PRIVATE_ADMIN_COMMANDS: BotCommand[] = [...ADMIN_ONLY, HELP, START];

export async function registerBotCommands(api: Api, groupChatId: number): Promise<void> {
  await api.setMyCommands([HELP]);
  await api.setMyCommands(PRIVATE_COMMANDS, { scope: { type: "all_private_chats" } });
  await api.setMyCommands(GROUP_COMMANDS, { scope: { type: "all_group_chats" } });
  await api.setMyCommands(GROUP_ADMIN_COMMANDS, {
    scope: { type: "chat_administrators", chat_id: groupChatId },
  });

  const registrations = await getAllRegistrations();
  await Promise.all(
    registrations.map(({ userId, registration }) =>
      registerPrivateAdminCommands(api, groupChatId, userId, registration.dmChatId),
    ),
  );
}

export async function registerPrivateAdminCommands(
  api: Api,
  groupChatId: number,
  userId: number,
  dmChatId: number,
): Promise<void> {
  const admin = await isGroupAdmin(api, groupChatId, userId);
  if (!admin) return;
  await api.setMyCommands(PRIVATE_ADMIN_COMMANDS, { scope: { type: "chat", chat_id: dmChatId } });
}
