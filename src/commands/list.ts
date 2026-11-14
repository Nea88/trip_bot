import type { Api, Context } from "grammy";
import { listActiveSuggestions, setAddedByName } from "../services/suggestions.js";
import { getGroupConfig } from "../services/groupConfig.js";
import { telegramName } from "../utils/userName.js";
import { photoBadge } from "../utils/photoMessage.js";
import { chunkLines } from "../utils/messageChunks.js";
import { allServantSummaries } from "../services/routeRatings.js";
import { servantBadge } from "../utils/servantScale.js";
import type { SuggestionWithId } from "../types/index.js";

/**
 * Telegram names of the authors (not usernames). Places added before names
 * were saved get theirs from Telegram once, while the author is still in
 * the group; otherwise a first name saved back then, or "участник".
 */
async function authorNames(api: Api, places: SuggestionWithId[]): Promise<Map<string, string>> {
  const { groupChatId } = await getGroupConfig();
  const looked = new Map<number, string | null>();
  const names = new Map<string, string>();
  for (const place of places) {
    let name = place.addedByName ?? null;
    if (!name) {
      if (!looked.has(place.addedByUserId)) {
        try {
          const member = await api.getChatMember(groupChatId, place.addedByUserId);
          looked.set(place.addedByUserId, telegramName(member.user));
        } catch {
          looked.set(place.addedByUserId, null);
        }
      }
      name = looked.get(place.addedByUserId) ?? null;
      if (name) await setAddedByName(place.id, name);
    }
    names.set(place.id, name ?? (place.addedByHasUsername === false ? place.addedByUsername : "участник"));
  }
  return names;
}

export async function listCommand(ctx: Context): Promise<void> {
  const active = await listActiveSuggestions();
  if (active.length === 0) {
    await ctx.reply("Активных предложений пока нет.");
    return;
  }

  const [servant, authors] = await Promise.all([allServantSummaries(), authorNames(ctx.api, active)]);
  const lines = active.map((s) => {
    const date = s.addedAt.toDate().toLocaleDateString("ru-RU");
    return `#${s.seq}: ${s.text}${photoBadge(s.photoCount)}${servantBadge(servant.get(s.id))} (добавил ${authors.get(s.id)}, ${date})`;
  });
  for (const chunk of chunkLines(lines)) {
    await ctx.reply(chunk);
  }
}
