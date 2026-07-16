export interface WinnerResult {
  kind: "no_votes" | "single" | "tie";
  candidateSuggestionIds: string[];
  voterCounts: number[];
}

/**
 * Pure function: given the poll option order (aligned with optionSuggestionIds)
 * and the final voter_count per option from stopPoll, determines the outcome.
 *
 * The mandatory "Мимокрокодил" (skip) option — represented by a null entry in
 * optionSuggestionIds — is deliberately excluded from winning: it exists so
 * people can signal "not going this time" without that skewing which real
 * destination wins. If every vote lands on it (or nobody votes at all), the
 * result is "no_votes" — no suggestion gets excluded.
 */
export function computeWinner(
  optionSuggestionIds: (string | null)[],
  voterCounts: number[],
): WinnerResult {
  const realIndexes = optionSuggestionIds
    .map((id, index) => ({ id, index }))
    .filter(({ id }) => id !== null)
    .map(({ index }) => index);

  const realVotesTotal = realIndexes.reduce((sum, i) => sum + voterCounts[i], 0);
  if (realVotesTotal === 0) {
    return { kind: "no_votes", candidateSuggestionIds: [], voterCounts: [] };
  }

  const max = Math.max(...realIndexes.map((i) => voterCounts[i]));
  const tiedIndexes = realIndexes.filter((i) => voterCounts[i] === max);

  const candidateSuggestionIds = tiedIndexes.map((i) => optionSuggestionIds[i] as string);
  const candidateVoterCounts = tiedIndexes.map((i) => voterCounts[i]);

  return {
    kind: tiedIndexes.length > 1 ? "tie" : "single",
    candidateSuggestionIds,
    voterCounts: candidateVoterCounts,
  };
}
