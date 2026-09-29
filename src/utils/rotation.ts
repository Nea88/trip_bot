export interface RotationCandidate {
  id: string;
  // When the place was added (ms).
  addedAt: number;
}

/**
 * Picks which places go into the poll. Places never shown in a poll come
 * first (newest first — fresh ideas get in right away), then the ones shown
 * longest ago, so older places rotate back in instead of never appearing.
 * The result is ordered by when the places were added, like /list.
 */
export function pickPollOptions<T extends RotationCandidate>(
  active: T[],
  lastShownAt: Map<string, number>,
  limit: number,
): T[] {
  const priority = [...active].sort((a, b) => {
    const shownA = lastShownAt.get(a.id);
    const shownB = lastShownAt.get(b.id);
    if (shownA === undefined && shownB === undefined) return b.addedAt - a.addedAt;
    if (shownA === undefined) return -1;
    if (shownB === undefined) return 1;
    return shownA - shownB || b.addedAt - a.addedAt;
  });
  return priority.slice(0, limit).sort((a, b) => a.addedAt - b.addedAt);
}

// Last time each place was an option, from polls' option lists.
export function lastShownAtFromPolls(
  polls: { optionSuggestionIds: (string | null)[]; createdAt: number }[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const poll of polls) {
    for (const id of poll.optionSuggestionIds) {
      if (id !== null && poll.createdAt > (result.get(id) ?? -Infinity)) result.set(id, poll.createdAt);
    }
  }
  return result;
}
