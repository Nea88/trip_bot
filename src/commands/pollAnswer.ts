import type { Context } from "grammy";
import { getPollByTelegramId } from "../services/polls.js";
import { recordVote } from "../services/pollVotes.js";

/**
 * Telegram tells the bot every (re)vote in its non-anonymous polls. We keep
 * each member's current answer to know who went on a trip.
 */
export async function pollAnswerHandler(ctx: Context): Promise<void> {
  const answer = ctx.pollAnswer;
  // Votes cast on behalf of a chat carry no user — nothing to attribute.
  if (!answer?.user) return;
  const poll = await getPollByTelegramId(answer.poll_id);
  if (!poll) return;
  const { user } = answer;
  await recordVote(
    poll.id,
    { userId: user.id, username: user.username ?? user.first_name, hasUsername: Boolean(user.username) },
    answer.option_ids,
  );
}
