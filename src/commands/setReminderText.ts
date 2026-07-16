import type { Context } from "grammy";
import { setReminderText } from "../services/groupConfig.js";

const USAGE = "Использование: /set_reminder_text <текст>";

export async function setReminderTextCommand(ctx: Context): Promise<void> {
  const text = ctx.match?.toString().trim();
  if (!text) {
    await ctx.reply(USAGE);
    return;
  }

  await setReminderText(text);
  await ctx.reply(`Текст памятки обновлён:\n\n${text}`);
}
