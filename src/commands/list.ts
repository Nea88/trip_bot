import type { Context } from "grammy";
import { listActiveSuggestions } from "../services/suggestions.js";

export async function listCommand(ctx: Context): Promise<void> {
  const active = await listActiveSuggestions();
  if (active.length === 0) {
    await ctx.reply("Активных предложений пока нет.");
    return;
  }

  const lines = active.map((s) => {
    const date = s.addedAt.toDate().toLocaleDateString("ru-RU");
    return `#${s.seq}: ${s.text} (добавил @${s.addedByUsername}, ${date})`;
  });
  await ctx.reply(lines.join("\n"));
}
