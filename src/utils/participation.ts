// A trip = a poll whose place the admin confirmed the group went to.
export interface Trip {
  pollId: string;
  suggestionId: string;
  tripDate: string; // ISO
  optionSuggestionIds: (string | null)[];
}

export interface VoteRecord {
  pollId: string;
  userId: number;
  username: string;
  hasUsername: boolean;
  optionIndexes: number[];
}

// Voting for the place the group ended up going to counts as having gone.
export function votedForTrip(trip: Trip, vote: VoteRecord): boolean {
  return (
    vote.pollId === trip.pollId &&
    vote.optionIndexes.some((i) => trip.optionSuggestionIds[i] === trip.suggestionId)
  );
}

// Trips the user went on, oldest first.
export function tripsJoined(userId: number, trips: Trip[], votes: VoteRecord[]): Trip[] {
  const mine = votes.filter((v) => v.userId === userId);
  return trips
    .filter((trip) => mine.some((vote) => votedForTrip(trip, vote)))
    .sort((a, b) => a.tripDate.localeCompare(b.tripDate));
}

export interface Rider {
  userId: number;
  username: string;
  hasUsername: boolean;
  trips: number;
}

// Members ranked by how many of the given trips they went on.
export function topRiders(trips: Trip[], votes: VoteRecord[]): Rider[] {
  const riders = new Map<number, Rider>();
  for (const trip of trips) {
    for (const vote of votes) {
      if (!votedForTrip(trip, vote)) continue;
      const rider = riders.get(vote.userId) ?? { ...vote, trips: 0 };
      rider.trips++;
      riders.set(vote.userId, rider);
    }
  }
  return [...riders.values()]
    .map(({ userId, username, hasUsername, trips }) => ({ userId, username, hasUsername, trips }))
    .sort((a, b) => b.trips - a.trips);
}

// Members who voted for the trip's place — the ones who went.
export function ridersOf(trip: Trip, votes: VoteRecord[]): VoteRecord[] {
  return votes.filter((vote) => votedForTrip(trip, vote));
}

/**
 * Regulars (voted in any earlier poll) who haven't voted in this one yet,
 * with the name from their latest vote.
 */
export function missingVoters(votes: VoteRecord[], pollId: string): VoteRecord[] {
  const votedNow = new Set(votes.filter((v) => v.pollId === pollId).map((v) => v.userId));
  const regulars = new Map<number, VoteRecord>();
  for (const vote of votes) {
    if (vote.pollId !== pollId && !votedNow.has(vote.userId)) regulars.set(vote.userId, vote);
  }
  return [...regulars.values()].sort((a, b) => a.username.localeCompare(b.username));
}
