import type { Context } from "grammy";
import { listExcludedSuggestions } from "../services/suggestions.js";

export async function excludedCommand(ctx: Context): Promise<void> {
  const excluded = await listExcludedSuggestions();
  if (excluded.length === 0) {
    await ctx.reply("Исключённых мест нет.");
    return;
  }

  const lines = excluded.map((s) => {
    const date = s.excludedAt?.toDate().toLocaleDateString("ru-RU") ?? "?";
    return `#${s.seq}: ${s.text} (исключено ${date})`;
  });
  await ctx.reply(lines.join("\n"));
}
