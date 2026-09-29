import { env } from "../config/env.js";
import { pollTripDate } from "../utils/tripDate.js";
import type { Trip } from "../utils/participation.js";
import { listClosedPolls } from "./polls.js";

// Confirmed trips: polls whose place the admin confirmed the group went to.
export async function listTrips(): Promise<Trip[]> {
  const polls = await listClosedPolls();
  return polls.flatMap((poll) => {
    const tripDate = pollTripDate(poll, env.defaultTimezone);
    return poll.winnerSuggestionId && tripDate
      ? [
          {
            pollId: poll.id,
            suggestionId: poll.winnerSuggestionId,
            tripDate,
            optionSuggestionIds: poll.optionSuggestionIds,
          },
        ]
      : [];
  });
}
