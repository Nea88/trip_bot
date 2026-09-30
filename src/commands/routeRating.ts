import { InlineKeyboard, type Api, type CallbackQueryContext, type Context } from "grammy";
import { getPollById } from "../services/polls.js";
import { getById as getSuggestionById } from "../services/suggestions.js";
import { rateRoute, servantSummaryFor } from "../services/routeRatings.js";
import { MAX_SCORE, MIN_SCORE, SERVANT_LEVELS, isValidScore, ratingPromptText } from "../utils/servantScale.js";

const CALLBACK_PREFIX = "srv";

function ratingKeyboard(pollId: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (let score = MIN_SCORE; score <= MAX_SCORE; score++) {
    keyboard.text(String(score), `${CALLBACK_PREFIX}:${pollId}:${score}`);
  }
  return keyboard;
}

// Posted to the group once the admin confirms where the trip went.
export async function postRatingPrompt(
  api: Api,
  groupChatId: number,
  pollId: string,
  suggestion: { id: string; text: string },
): Promise<void> {
  const summary = await servantSummaryFor(suggestion.id);
  await api.sendMessage(groupChatId, ratingPromptText(suggestion.text, summary), {
    reply_markup: ratingKeyboard(pollId),
  });
}

/**
 * Any member rates the route (not only those who voted for it: the vote
 * isn't proof of who went). The post shows the running average.
 */
export async function routeRatingCallback(ctx: CallbackQueryContext<Context>): Promise<void> {
  const [, pollId, rawScore] = (ctx.callbackQuery.data ?? "").split(":");
  const score = Number(rawScore);
  const poll = await getPollById(pollId);
  const suggestion = poll?.winnerSuggestionId ? await getSuggestionById(poll.winnerSuggestionId) : null;
  if (!isValidScore(score) || !poll || !suggestion) {
    await ctx.answerCallbackQuery({ text: "Эта оценка больше не принимается." });
    return;
  }

  await rateRoute(pollId, suggestion.id, ctx.from.id, score);
  await ctx.answerCallbackQuery({ text: `Ваша оценка: ${score} — ${SERVANT_LEVELS[score]}` });

  const text = ratingPromptText(suggestion.text, await servantSummaryFor(suggestion.id));
  // Telegram refuses an edit that changes nothing (same score tapped again).
  if (text !== ctx.callbackQuery.message?.text) {
    await ctx.editMessageText(text, { reply_markup: ratingKeyboard(pollId) });
  }
}

export const routeRatingCallbackPattern = new RegExp(`^${CALLBACK_PREFIX}:`);
