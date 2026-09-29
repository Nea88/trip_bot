import type { Context, NextFunction } from "grammy";
import { getGroupConfig } from "../../services/groupConfig.js";
import { isAdminSender } from "../../services/adminAuth.js";

export async function requireAdmin(ctx: Context, next: NextFunction): Promise<void> {
  const config = await getGroupConfig();
  if (!(await isAdminSender(ctx, config.groupChatId))) {
    await ctx.reply("Эта команда доступна только админам группы.");
    return;
  }
  await next();
}
