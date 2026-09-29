import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { isAdminSender } from "../services/adminAuth.js";
import { helpText } from "../bot/commandSpecs.js";

export async function helpCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  await ctx.reply(helpText(await isAdminSender(ctx, config.groupChatId)));
}
