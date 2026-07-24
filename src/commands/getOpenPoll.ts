import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { getOpenPoll } from "../services/polls.js";

function buildPollLink(groupChatId: number, messageId: number): string {
  const internalId = String(groupChatId).replace(/^-100/, "");
  return `https://t.me/c/${internalId}/${messageId}`;
}

export async function getOpenPollCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  const poll = await getOpenPoll(config.groupChatId);

  if (!poll) {
    await ctx.reply("Сейчас нет открытого опроса.");
    return;
  }

  await ctx.reply(buildPollLink(config.groupChatId, poll.messageId));
}
