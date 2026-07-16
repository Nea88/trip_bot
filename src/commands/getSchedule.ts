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

export async function getScheduleCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();

  if (config.scheduleDay == null || config.scheduleTime == null || config.timezone == null) {
    await ctx.reply(
      "Расписание автосоздания опроса не задано (настройте через /set_schedule).",
    );
    return;
  }

  const dayName = DAY_NAMES[config.scheduleDay] ?? String(config.scheduleDay);
  await ctx.reply(
    `Опрос создаётся автоматически каждую(ый) ${dayName} в ${config.scheduleTime} (${config.timezone})`,
  );
}
