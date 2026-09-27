import type { Context } from "grammy";
import { listActiveSuggestions } from "../services/suggestions.js";
import { formatUserName } from "../utils/userName.js";
import { chunkLines } from "../utils/messageChunks.js";

export async function listCommand(ctx: Context): Promise<void> {
  const active = await listActiveSuggestions();
  if (active.length === 0) {
    await ctx.reply("Активных предложений пока нет.");
    return;
  }

  const lines = active.map((s) => {
    const date = s.addedAt.toDate().toLocaleDateString("ru-RU");
    return `#${s.seq}: ${s.text} (добавил ${formatUserName(s.addedByUsername, s.addedByHasUsername !== false)}, ${date})`;
  });
  for (const chunk of chunkLines(lines)) {
    await ctx.reply(chunk);
  }
}
