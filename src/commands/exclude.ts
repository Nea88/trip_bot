import type { Context } from "grammy";
import { getBySeq, excludeSuggestion } from "../services/suggestions.js";

export async function excludeCommand(ctx: Context): Promise<void> {
  const arg = ctx.match?.toString().trim();
  const seq = Number(arg);
  if (!arg || !Number.isInteger(seq)) {
    await ctx.reply("Использование: /exclude <номер>");
    return;
  }

  const suggestion = await getBySeq(seq);
  if (!suggestion || suggestion.status !== "active") {
    await ctx.reply(`Активное предложение #${seq} не найдено.`);
    return;
  }

  await excludeSuggestion(suggestion.id);
  await ctx.reply(`#${seq}: "${suggestion.text}" исключено из пула.`);
}
