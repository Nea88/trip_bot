import type { Context, NextFunction } from "grammy";
import { getGroupConfig } from "../../services/groupConfig.js";
import { isAdminSender } from "../../services/adminAuth.js";

/**
 * Group commands that admins may also run in their DM with the bot:
 * everyone in the group, admins in private chats too.
 */
export async function requireGroupOrAdminDm(ctx: Context, next: NextFunction): Promise<void> {
  const config = await getGroupConfig();
  if (ctx.chat?.id === config.groupChatId) return next();
  if (ctx.chat?.type === "private" && (await isAdminSender(ctx, config.groupChatId))) return next();
  await ctx.reply("Эта команда работает только в группе поездок (админам — и в личке с ботом).");
}
