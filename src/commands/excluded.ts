import type { Context } from "grammy";
import { listExcludedSuggestions } from "../services/suggestions.js";
import { photoBadge } from "../utils/photoMessage.js";
import { chunkLines } from "../utils/messageChunks.js";
import { allServantSummaries } from "../services/routeRatings.js";
import { servantBadge } from "../utils/servantScale.js";

export async function excludedCommand(ctx: Context): Promise<void> {
  const excluded = await listExcludedSuggestions();
  if (excluded.length === 0) {
    await ctx.reply("Исключённых мест нет.");
    return;
  }

  const servant = await allServantSummaries();
  const lines = excluded.map((s) => {
    const date = s.excludedAt?.toDate().toLocaleDateString("ru-RU") ?? "?";
    return `#${s.seq}: ${s.text}${photoBadge(s.photoCount)}${servantBadge(servant.get(s.id))} (исключено ${date})`;
  });
  for (const chunk of chunkLines(lines)) {
    await ctx.reply(chunk);
  }
}
