import type { Context } from "grammy";
import { registerForNotifications } from "../services/registrations.js";
import { registerPrivateAdminCommands } from "../bot/commands.js";
import { getGroupConfig } from "../services/groupConfig.js";

export async function startCommand(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.chat) return;
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  const username = ctx.from.username ?? ctx.from.first_name ?? "друг";

  await registerForNotifications(userId, chatId, username);

  const config = await getGroupConfig();
  await registerPrivateAdminCommands(ctx.api, config.groupChatId, userId, chatId);

  await ctx.reply(
    "Готово! Если вы админ группы, теперь будете получать уведомления о новых предложениях маршрутов.",
  );
}
