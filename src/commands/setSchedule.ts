import type { Context } from "grammy";
import { parseWeeklySchedule } from "../utils/time.js";
import { setCloseSchedule, setSchedule } from "../services/groupConfig.js";
import { rescheduleCloseFromConfig, rescheduleFromConfig } from "../scheduler/scheduler.js";
import { env } from "../config/env.js";

function usage(command: string, example: string): string {
  return `Использование: /${command} <день недели> <ЧЧ:ММ> [IANA таймзона]\nБез таймзоны — ${env.defaultTimezone}.\nПример: /${command} ${example}`;
}

export async function setScheduleCommand(ctx: Context): Promise<void> {
  const USAGE = usage("set_schedule", "monday 10:00 Europe/Moscow");
  const parsed = parseWeeklySchedule(ctx.match?.toString() ?? "", env.defaultTimezone);
  if ("error" in parsed) {
    await ctx.reply(parsed.error ? `${parsed.error}\n${USAGE}` : USAGE);
    return;
  }

  await setSchedule(parsed.day, parsed.time, parsed.timezone);
  await rescheduleFromConfig(ctx.api);
  await ctx.reply(`Расписание создания опроса: ${ctx.match?.toString().trim().split(/\s+/)[0]} ${parsed.time} (${parsed.timezone}).`);
}

export async function setCloseScheduleCommand(ctx: Context): Promise<void> {
  const USAGE = usage("set_close_schedule", "sunday 12:00 Europe/Moscow");
  const parsed = parseWeeklySchedule(ctx.match?.toString() ?? "", env.defaultTimezone);
  if ("error" in parsed) {
    await ctx.reply(parsed.error ? `${parsed.error}\n${USAGE}` : USAGE);
    return;
  }

  await setCloseSchedule(parsed.day, parsed.time, parsed.timezone);
  await rescheduleCloseFromConfig(ctx.api);
  await ctx.reply(
    `Опрос будет закрываться автоматически: ${ctx.match?.toString().trim().split(/\s+/)[0]} ${parsed.time} (${parsed.timezone}). После закрытия админ подтверждает, куда съездили.`,
  );
}
