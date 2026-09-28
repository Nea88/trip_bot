import type { Api } from "grammy";
import { DateTime } from "luxon";
import { env } from "../config/env.js";
import { getGroupConfig, markMemoriesSent } from "./groupConfig.js";
import { listClosedPolls } from "./polls.js";
import { getById } from "./suggestions.js";
import { listApprovedForSuggestion } from "./placePhotos.js";
import { findAnniversaries, formatMemories, type MemoryItem } from "../utils/memories.js";
import { groupArchive } from "../utils/placeArchive.js";
import { pollTripDate } from "../utils/tripDate.js";

/**
 * Posts "on this day N years ago we went to…" for trips (polls with a
 * confirmed winner, dated by the Saturday of the trip). At most once per day.
 */
export async function sendTripMemories(api: Api, now: DateTime = DateTime.now()): Promise<void> {
  const timezone = env.defaultTimezone;
  const today = now.setZone(timezone).toISODate();
  const config = await getGroupConfig();
  if (!today || config.lastMemoriesSentDate === today) return;

  const trips = (await listClosedPolls()).flatMap((poll) => {
    const tripDate = pollTripDate(poll, timezone);
    return poll.winnerSuggestionId && tripDate
      ? [{ suggestionId: poll.winnerSuggestionId, date: DateTime.fromISO(tripDate, { zone: timezone }).toJSDate() }]
      : [];
  });
  const items: MemoryItem[] = [];
  for (const { suggestionId, yearsAgo } of findAnniversaries(trips, now, timezone)) {
    const suggestion = await getById(suggestionId);
    if (!suggestion) continue;
    const photos = await listApprovedForSuggestion(suggestionId);
    const entries = groupArchive(
      photos.map((p) => ({ ...p, addedAt: p.addedAt.toDate(), addedByHasUsername: p.addedByHasUsername !== false })),
    );
    items.push({ seq: suggestion.seq, text: suggestion.text, yearsAgo, entries });
  }
  if (items.length === 0) return;

  await api.sendMessage(config.groupChatId, formatMemories(items), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  await markMemoriesSent(today);
}
