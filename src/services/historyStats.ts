import type { SuggestionStatus } from "../types/index.js";

// Plain inputs (no Firestore types) so the aggregation stays pure and testable.
export interface HistoryPoll {
  optionSuggestionIds: (string | null)[];
  winnerSuggestionId: string | null;
  closedAt: Date | null;
  // How many members went (voted for the confirmed place); 0 if unknown.
  riders?: number;
}

export interface HistorySuggestion {
  id: string;
  seq: number;
  text: string;
  status: SuggestionStatus;
  addedByUserId: number;
  addedByUsername: string;
  addedByHasUsername?: boolean;
  addedAt: Date | null;
  photoCount?: number;
}

export interface Trip {
  date: Date | null;
  // null when the place was deleted after the trip.
  suggestion: HistorySuggestion | null;
  riders: number;
}

export interface AuthorStats {
  username: string;
  hasUsername: boolean;
  ideas: number;
  wins: number;
}

export interface LoserStats {
  suggestion: HistorySuggestion;
  losses: number;
  appearances: number;
}

export interface HistoryStats {
  trips: Trip[];
  topAuthors: AuthorStats[];
  topLosers: LoserStats[];
}

// Suggestions an admin accepted — pending and rejected ones aren't real ideas yet.
const APPROVED_STATUSES = new Set<SuggestionStatus>(["active", "excluded"]);

/**
 * Only polls with a confirmed winner count as trips and as losses for the
 * other options: a cancelled poll or one with no votes decided nothing.
 */
export function computeHistory(
  polls: HistoryPoll[],
  suggestions: HistorySuggestion[],
  topLimit: number,
): HistoryStats {
  const byId = new Map(suggestions.map((s) => [s.id, s]));
  const decided = polls.filter((p) => p.winnerSuggestionId !== null);

  const trips: Trip[] = decided
    .map((p) => ({ date: p.closedAt, suggestion: byId.get(p.winnerSuggestionId!) ?? null, riders: p.riders ?? 0 }))
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));

  // Keyed by user id; the name comes from their most recent suggestion.
  const authors = new Map<number, AuthorStats & { latestAt: number }>();
  for (const s of suggestions) {
    if (!APPROVED_STATUSES.has(s.status)) continue;
    const at = s.addedAt?.getTime() ?? 0;
    const entry = authors.get(s.addedByUserId);
    if (!entry) {
      authors.set(s.addedByUserId, {
        username: s.addedByUsername,
        hasUsername: s.addedByHasUsername !== false,
        ideas: 1,
        wins: 0,
        latestAt: at,
      });
      continue;
    }
    entry.ideas++;
    if (at >= entry.latestAt) {
      entry.username = s.addedByUsername;
      entry.hasUsername = s.addedByHasUsername !== false;
      entry.latestAt = at;
    }
  }
  for (const trip of trips) {
    if (trip.suggestion) {
      const entry = authors.get(trip.suggestion.addedByUserId);
      if (entry) entry.wins++;
    }
  }
  const topAuthors = [...authors.values()]
    .sort((a, b) => b.ideas - a.ideas || b.wins - a.wins)
    .slice(0, topLimit)
    .map(({ username, hasUsername, ideas, wins }) => ({ username, hasUsername, ideas, wins }));

  const losers = new Map<string, { losses: number; appearances: number }>();
  for (const poll of decided) {
    for (const id of poll.optionSuggestionIds) {
      if (id === null) continue;
      const entry = losers.get(id) ?? { losses: 0, appearances: 0 };
      entry.appearances++;
      if (id !== poll.winnerSuggestionId) entry.losses++;
      losers.set(id, entry);
    }
  }
  const topLosers = [...losers.entries()]
    .filter(([id, entry]) => entry.losses > 0 && byId.has(id))
    .map(([id, entry]) => ({ suggestion: byId.get(id)!, ...entry }))
    .sort((a, b) => b.losses - a.losses || a.appearances - b.appearances)
    .slice(0, topLimit);

  return { trips, topAuthors, topLosers };
}
