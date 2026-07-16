import type { Context, NextFunction } from "grammy";
import { getGroupConfig } from "../../services/groupConfig.js";
import { isGroupAdmin } from "../../services/adminAuth.js";

export async function requireAdmin(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const config = await getGroupConfig();
  const admin = await isGroupAdmin(ctx.api, config.groupChatId, userId);
  if (!admin) {
    await ctx.reply("Эта команда доступна только админам группы.");
    return;
  }
  await next();
}
