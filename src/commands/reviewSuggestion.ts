import type { CallbackQueryContext, Context } from "grammy";
import { getById, approveSuggestion, rejectSuggestion } from "../services/suggestions.js";
import { getGroupConfig } from "../services/groupConfig.js";

const CALLBACK_PREFIX = "rev";

export function buildReviewCallbackData(suggestionId: string, action: "approve" | "reject") {
  return `${CALLBACK_PREFIX}:${suggestionId}:${action}`;
}

export async function reviewCallback(ctx: CallbackQueryContext<Context>): Promise<void> {
  const data = ctx.callbackQuery.data ?? "";
  const [, suggestionId, action] = data.split(":");

  const suggestion = await getById(suggestionId);
  if (!suggestion) {
    await ctx.editMessageText("Это предложение больше не существует.");
    await ctx.answerCallbackQuery();
    return;
  }
  if (suggestion.status !== "pending") {
    await ctx.editMessageText(
      `Уже обработано кем-то другим: #${suggestion.seq} "${suggestion.text}" (${suggestion.status}).`,
    );
    await ctx.answerCallbackQuery();
    return;
  }

  if (action === "reject") {
    await rejectSuggestion(suggestion.id);
    await ctx.editMessageText(`Отклонено: #${suggestion.seq} "${suggestion.text}"`);
    await ctx.answerCallbackQuery();
    return;
  }

  await approveSuggestion(suggestion.id);
  await ctx.editMessageText(`Одобрено: #${suggestion.seq} "${suggestion.text}"`);
  await ctx.answerCallbackQuery();

  const config = await getGroupConfig();
  await ctx.api.sendMessage(
    config.groupChatId,
    `Добавлено предложение #${suggestion.seq}: ${suggestion.text}`,
  );
}

export const reviewCallbackPattern = new RegExp(`^${CALLBACK_PREFIX}:`);
