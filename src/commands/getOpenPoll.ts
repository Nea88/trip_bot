import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { getOpenPoll } from "../services/polls.js";
import { buildMessageLink } from "../utils/photoMessage.js";

export async function getOpenPollCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  const poll = await getOpenPoll(config.groupChatId);

  if (!poll) {
    await ctx.reply("Сейчас нет открытого опроса.");
    return;
  }

  await ctx.reply(buildMessageLink(config.groupChatId, poll.messageId));
}
