import type { Context } from "grammy";
import { isValidTime, isValidTimezone } from "../utils/time.js";
import { setReminderSchedule } from "../services/groupConfig.js";
import { rescheduleReminderFromConfig } from "../scheduler/scheduler.js";

const USAGE = "Использование: /set_reminder_time <ЧЧ:ММ> <IANA таймзона>\nПример: /set_reminder_time 12:00 Europe/Moscow";

export async function setReminderTimeCommand(ctx: Context): Promise<void> {
  const args = (ctx.match?.toString().trim() ?? "").split(/\s+/).filter(Boolean);
  if (args.length !== 2) {
    await ctx.reply(USAGE);
    return;
  }

  const [timeArg, tzArg] = args;
  if (!isValidTime(timeArg)) {
    await ctx.reply(`Неверный формат времени "${timeArg}", ожидается ЧЧ:ММ.\n${USAGE}`);
    return;
  }
  if (!isValidTimezone(tzArg)) {
    await ctx.reply(`Неизвестная таймзона "${tzArg}".\n${USAGE}`);
    return;
  }

  await setReminderSchedule(timeArg, tzArg);
  await rescheduleReminderFromConfig(ctx.api);
  await ctx.reply(`Ежедневная памятка будет приходить в ${timeArg} (${tzArg}).`);
}
