import type { Context } from "grammy";
import { getBySeq, editSuggestionText } from "../services/suggestions.js";
import { validateSuggestionText } from "../utils/suggestionText.js";

export async function editCommand(ctx: Context): Promise<void> {
  const args = ctx.match?.toString().trim() ?? "";
  const spaceIndex = args.indexOf(" ");
  if (spaceIndex === -1) {
    await ctx.reply("Использование: /edit <номер> <новый текст>");
    return;
  }

  const seq = Number(args.slice(0, spaceIndex));
  const newText = args.slice(spaceIndex + 1).trim();
  if (!Number.isInteger(seq) || !newText) {
    await ctx.reply("Использование: /edit <номер> <новый текст>");
    return;
  }
  const validationError = validateSuggestionText(newText);
  if (validationError) {
    await ctx.reply(validationError);
    return;
  }

  const suggestion = await getBySeq(seq);
  if (!suggestion || suggestion.status !== "active") {
    await ctx.reply(`Активное предложение #${seq} не найдено.`);
    return;
  }

  await editSuggestionText(suggestion.id, newText);
  await ctx.reply(`#${seq} обновлено: "${suggestion.text}" → "${newText}"`);
}
