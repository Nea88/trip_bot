import type { Context } from "grammy";
import { isValidTime, timezoneArgumentError } from "../utils/time.js";
import { setReminderSchedule } from "../services/groupConfig.js";
import { rescheduleReminderFromConfig } from "../scheduler/scheduler.js";
import { env } from "../config/env.js";

const USAGE = `Использование: /set_reminder_time <ЧЧ:ММ> (время — ${env.defaultTimezone})\nПример: /set_reminder_time 12:00`;

export async function setReminderTimeCommand(ctx: Context): Promise<void> {
  const args = (ctx.match?.toString().trim() ?? "").split(/\s+/).filter(Boolean);
  if (args.length === 2) {
    await ctx.reply(`${timezoneArgumentError(env.defaultTimezone)}\n${USAGE}`);
    return;
  }
  if (args.length !== 1) {
    await ctx.reply(USAGE);
    return;
  }

  const [timeArg] = args;
  if (!isValidTime(timeArg)) {
    await ctx.reply(`Неверный формат времени "${timeArg}", ожидается ЧЧ:ММ.\n${USAGE}`);
    return;
  }

  await setReminderSchedule(timeArg);
  await rescheduleReminderFromConfig(ctx.api);
  await ctx.reply(`Памятка будет приходить через день в ${timeArg} (${env.defaultTimezone}).`);
}
