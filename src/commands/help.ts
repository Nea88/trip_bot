import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { isGroupAdmin } from "../services/adminAuth.js";
import { helpText } from "../bot/commandSpecs.js";

export async function helpCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply(helpText(false));
    return;
  }

  const config = await getGroupConfig();
  const admin = await isGroupAdmin(ctx.api, config.groupChatId, userId);
  await ctx.reply(helpText(admin));
}
