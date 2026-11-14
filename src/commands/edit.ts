import type { Context } from "grammy";
import { getBySeq } from "../services/suggestions.js";
import { renamePlace } from "../services/placeRename.js";

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

  const suggestion = await getBySeq(seq);
  const result = suggestion ? await renamePlace(suggestion.id, newText) : ({ kind: "not_found" } as const);
  switch (result.kind) {
    case "invalid":
      await ctx.reply(result.error);
      return;
    case "not_found":
      await ctx.reply(`Активное предложение #${seq} не найдено.`);
      return;
    case "duplicate":
      await ctx.reply(`Такой вариант уже есть: #${result.seq} "${result.text}".`);
      return;
    case "unchanged":
      await ctx.reply(`#${seq} уже называется "${newText}".`);
      return;
    case "renamed":
      await ctx.reply(`#${seq} обновлено: "${result.oldText}" → "${result.place.text}"`);
  }
}
