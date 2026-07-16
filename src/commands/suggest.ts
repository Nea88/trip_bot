import { InlineKeyboard, type Context } from "grammy";
import {
  addSuggestion,
  findByNormalizedText,
  normalizeSuggestionText,
} from "../services/suggestions.js";
import { notifyAdmins } from "../services/notifications.js";
import { getGroupConfig } from "../services/groupConfig.js";
import { validateSuggestionText } from "../utils/suggestionText.js";
import { buildReviewCallbackData } from "./reviewSuggestion.js";

export async function suggestCommand(ctx: Context): Promise<void> {
  const text = ctx.match?.toString().trim();
  if (!text) {
    await ctx.reply("Использование: /suggest <куда поехать>");
    return;
  }
  const validationError = validateSuggestionText(text);
  if (validationError) {
    await ctx.reply(validationError);
    return;
  }

  const existing = await findByNormalizedText(normalizeSuggestionText(text));
  if (existing) {
    if (existing.status === "active") {
      await ctx.reply(`Такой вариант уже есть в списке: #${existing.seq}`);
    } else if (existing.status === "pending") {
      await ctx.reply("Такой вариант уже отправлен на рассмотрение и ждёт решения админа.");
    } else if (existing.status === "rejected") {
      await ctx.reply("Этот вариант уже был отклонён админом — повторно предложить его нельзя.");
    } else {
      await ctx.reply(
        `Это место уже предлагали и оно исключено (#${existing.seq}). Попросите админа вернуть его командой /restore ${existing.seq}, вместо того чтобы добавлять заново.`,
      );
    }
    return;
  }

  const userId = ctx.from!.id;
  const username = ctx.from!.username ?? ctx.from!.first_name ?? "кто-то";

  const suggestion = await addSuggestion(text, userId, username);
  await ctx.reply("Ваш вариант отправлен на рассмотрение админу.");

  const config = await getGroupConfig();
  const keyboard = new InlineKeyboard()
    .text("Одобрить", buildReviewCallbackData(suggestion.id, "approve"))
    .text("Отклонить", buildReviewCallbackData(suggestion.id, "reject"));

  await notifyAdmins(
    ctx.api,
    config.groupChatId,
    `Новое предложение маршрута от @${username}:\n#${suggestion.seq}: ${text}`,
    keyboard,
  );
}
