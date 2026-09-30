import type { Context } from "grammy";
import { listActiveSuggestions } from "../services/suggestions.js";
import { formatUserName } from "../utils/userName.js";
import { photoBadge } from "../utils/photoMessage.js";
import { chunkLines } from "../utils/messageChunks.js";
import { allServantSummaries } from "../services/routeRatings.js";
import { servantBadge } from "../utils/servantScale.js";

export async function listCommand(ctx: Context): Promise<void> {
  const active = await listActiveSuggestions();
  if (active.length === 0) {
    await ctx.reply("Активных предложений пока нет.");
    return;
  }

  const servant = await allServantSummaries();
  const lines = active.map((s) => {
    const date = s.addedAt.toDate().toLocaleDateString("ru-RU");
    return `#${s.seq}: ${s.text}${photoBadge(s.photoCount)}${servantBadge(servant.get(s.id))} (добавил ${formatUserName(s.addedByUsername, s.addedByHasUsername !== false)}, ${date})`;
  });
  for (const chunk of chunkLines(lines)) {
    await ctx.reply(chunk);
  }
}
