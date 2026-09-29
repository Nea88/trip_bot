import type { Context } from "grammy";
import { listAllSuggestions } from "../services/suggestions.js";
import { listByAuthor } from "../services/placePhotos.js";
import { listVotesByUser } from "../services/pollVotes.js";
import { listTrips } from "../services/trips.js";
import { formatUserName } from "../utils/userName.js";
import { formatUserStats } from "../utils/userStats.js";

export async function meCommand(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const [suggestions, trips, votes, archive] = await Promise.all([
    listAllSuggestions(),
    listTrips(),
    listVotesByUser(from.id),
    listByAuthor(from.id),
  ]);
  const name = formatUserName(from.username ?? from.first_name, Boolean(from.username));
  await ctx.reply(formatUserStats(from.id, name, { suggestions, trips, votes, archive }));
}
