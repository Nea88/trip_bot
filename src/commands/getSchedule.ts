import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";

const DAY_NAMES = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];

function describe(day: number | null | undefined, time: string | null | undefined, tz: string | null | undefined): string | null {
  if (day == null || time == null || tz == null) return null;
  return `${DAY_NAMES[day] ?? String(day)} в ${time} (${tz})`;
}

export async function getScheduleCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  const create = describe(config.scheduleDay, config.scheduleTime, config.timezone);
  const close = describe(config.closeScheduleDay, config.closeScheduleTime, config.closeTimezone);

  await ctx.reply(
    [
      create ? `Создание опроса: ${create}` : "Создание опроса по расписанию не задано (/set_schedule).",
      close ? `Закрытие опроса: ${close}` : "Автозакрытие опроса не задано (/set_close_schedule).",
    ].join("\n"),
  );
}
