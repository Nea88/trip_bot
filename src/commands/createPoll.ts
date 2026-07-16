import type { Context } from "grammy";
import { createPollIfPossible } from "../services/pollCreation.js";
import { getGroupConfig } from "../services/groupConfig.js";

export async function createPollCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  const result = await createPollIfPossible(ctx.api, config.groupChatId);

  switch (result.kind) {
    case "already_open":
      await ctx.reply("Опрос уже открыт. Сначала закройте его через /close_poll.");
      return;
    case "no_suggestions":
      await ctx.reply("Нет активных предложений для опроса.");
      return;
    case "created":
      await ctx.reply(`Опрос создан с ${result.optionCount} вариантами.`);
      return;
  }
}
