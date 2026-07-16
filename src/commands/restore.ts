import type { Context } from "grammy";
import { getBySeq, restoreSuggestion } from "../services/suggestions.js";

export async function restoreCommand(ctx: Context): Promise<void> {
  const arg = ctx.match?.toString().trim();
  const seq = Number(arg);
  if (!arg || !Number.isInteger(seq)) {
    await ctx.reply("Использование: /restore <номер>");
    return;
  }

  const suggestion = await getBySeq(seq);
  if (!suggestion || suggestion.status !== "excluded") {
    await ctx.reply(`Исключённое предложение #${seq} не найдено.`);
    return;
  }

  await restoreSuggestion(suggestion.id);
  await ctx.reply(`#${seq}: "${suggestion.text}" возвращено в список вариантов.`);
}
