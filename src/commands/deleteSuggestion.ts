import { InlineKeyboard, type CallbackQueryContext, type Context } from "grammy";
import {
  getBySeq,
  getById,
  deleteSuggestion as deleteSuggestionById,
} from "../services/suggestions.js";

const CALLBACK_PREFIX = "del";

export async function deleteCommand(ctx: Context): Promise<void> {
  const arg = ctx.match?.toString().trim();
  const seq = Number(arg);
  if (!arg || !Number.isInteger(seq)) {
    await ctx.reply("Использование: /delete <номер>");
    return;
  }

  const suggestion = await getBySeq(seq);
  if (!suggestion) {
    await ctx.reply(`Предложение #${seq} не найдено.`);
    return;
  }

  const keyboard = new InlineKeyboard()
    .text("Удалить", `${CALLBACK_PREFIX}:confirm:${suggestion.id}`)
    .text("Отмена", `${CALLBACK_PREFIX}:cancel`);

  await ctx.reply(`Удалить #${seq}: "${suggestion.text}"? Это необратимо.`, {
    reply_markup: keyboard,
  });
}

export async function deleteCallback(ctx: CallbackQueryContext<Context>): Promise<void> {
  const data = ctx.callbackQuery.data ?? "";
  const parts = data.split(":");

  if (parts[1] === "cancel") {
    await ctx.editMessageText("Удаление отменено.");
    await ctx.answerCallbackQuery();
    return;
  }

  const suggestionId = parts[2];
  const suggestion = await getById(suggestionId);
  if (!suggestion) {
    await ctx.editMessageText("Предложение уже не существует.");
    await ctx.answerCallbackQuery();
    return;
  }

  await deleteSuggestionById(suggestionId);
  await ctx.editMessageText(`Удалено #${suggestion.seq}: "${suggestion.text}"`);
  await ctx.answerCallbackQuery();
}

export const deleteCallbackPattern = new RegExp(`^${CALLBACK_PREFIX}:`);
