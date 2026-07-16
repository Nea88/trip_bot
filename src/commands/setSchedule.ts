import type { Context } from "grammy";
import { parseDayOfWeek, isValidTime, isValidTimezone } from "../utils/time.js";
import { setSchedule } from "../services/groupConfig.js";
import { rescheduleFromConfig } from "../scheduler/scheduler.js";

const USAGE = "Использование: /set_schedule <день недели> <ЧЧ:ММ> <IANA таймзона>\nПример: /set_schedule friday 10:00 Europe/Moscow";

export async function setScheduleCommand(ctx: Context): Promise<void> {
  const args = (ctx.match?.toString().trim() ?? "").split(/\s+/).filter(Boolean);
  if (args.length !== 3) {
    await ctx.reply(USAGE);
    return;
  }

  const [dayArg, timeArg, tzArg] = args;
  const day = parseDayOfWeek(dayArg);
  if (day === null) {
    await ctx.reply(`Не распознан день недели "${dayArg}".\n${USAGE}`);
    return;
  }
  if (!isValidTime(timeArg)) {
    await ctx.reply(`Неверный формат времени "${timeArg}", ожидается ЧЧ:ММ.\n${USAGE}`);
    return;
  }
  if (!isValidTimezone(tzArg)) {
    await ctx.reply(`Неизвестная таймзона "${tzArg}".\n${USAGE}`);
    return;
  }

  await setSchedule(day, timeArg, tzArg);
  await rescheduleFromConfig(ctx.api);
  await ctx.reply(`Расписание установлено: ${dayArg} ${timeArg} (${tzArg}).`);
}
