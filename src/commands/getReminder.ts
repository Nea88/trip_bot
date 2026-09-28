import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { DEFAULT_REMINDER_TEXT } from "../constants.js";
import { env } from "../config/env.js";

export async function getReminderCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();

  const timeLine =
    config.reminderTime
      ? `Время: ${config.reminderTime} (${env.defaultTimezone})`
      : "Время: не задано — памятка не отправляется (настройте через /set_reminder_time)";

  const isCustomText = Boolean(config.reminderText);
  const textLine = `Текст (${isCustomText ? "свой" : "по умолчанию"}):\n${config.reminderText ?? DEFAULT_REMINDER_TEXT}`;

  await ctx.reply(`${timeLine}\n\n${textLine}`);
}
