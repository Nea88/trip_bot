export interface WinnerResult {
  kind: "no_votes" | "single" | "tie";
  // null entries represent the mandatory "Мимокрокодил" (skip) option.
  candidateSuggestionIds: (string | null)[];
  voterCounts: number[];
}

/**
 * Pure function: given the poll option order (aligned with optionSuggestionIds)
 * and the final voter_count per option from stopPoll, determines the outcome.
 */
export function computeWinner(
  optionSuggestionIds: (string | null)[],
  voterCounts: number[],
  totalVoterCount: number,
): WinnerResult {
  if (totalVoterCount === 0) {
    return { kind: "no_votes", candidateSuggestionIds: [], voterCounts: [] };
  }

  const max = Math.max(...voterCounts);
  const tiedIndexes = voterCounts
    .map((count, index) => ({ count, index }))
    .filter(({ count }) => count === max)
    .map(({ index }) => index);

  const candidateSuggestionIds = tiedIndexes.map((i) => optionSuggestionIds[i]);
  const candidateVoterCounts = tiedIndexes.map((i) => voterCounts[i]);

  return {
    kind: tiedIndexes.length > 1 ? "tie" : "single",
    candidateSuggestionIds,
    voterCounts: candidateVoterCounts,
  };
}
