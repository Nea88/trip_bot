import type { Context, NextFunction } from "grammy";
import { getGroupConfig } from "../../services/groupConfig.js";

export async function requireGroupChat(ctx: Context, next: NextFunction): Promise<void> {
  const config = await getGroupConfig();
  if (ctx.chat?.id !== config.groupChatId) {
    await ctx.reply("Эта команда работает только в группе поездок.");
    return;
  }
  await next();
}
