import type { CallbackQueryContext, Context } from "grammy";
import { now } from "../utils/clock.js";
import { getGroupConfig } from "../services/groupConfig.js";
import { getPollById, resolvePendingResult } from "../services/polls.js";
import { getById as getSuggestionById, excludeSuggestion } from "../services/suggestions.js";
import {
  CLOSE_OUTCOME_TEXT,
  CLOSE_POLL_CALLBACK_PREFIX,
  cancelOpenPoll,
  closeOpenPoll,
} from "../services/pollClosing.js";
import { env } from "../config/env.js";
import { formatIsoDate, tripDateFor } from "../utils/tripDate.js";
import { ridersOf } from "../utils/participation.js";
import { mentionHtml } from "../utils/userName.js";
import { escapeHtml } from "../utils/html.js";
import { listVotesForPoll } from "../services/pollVotes.js";

export async function closePollCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  const outcome = await closeOpenPoll(ctx.api, config.groupChatId);
  if (outcome !== "awaiting_confirmation") {
    await ctx.reply(CLOSE_OUTCOME_TEXT[outcome]);
  }
}

export async function cancelPollCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  const outcome = await cancelOpenPoll(ctx.api, config.groupChatId);
  await ctx.reply(
    outcome === "cancelled"
      ? "Опрос закрыт без подсчёта результатов — победитель не выбирается, место не исключается."
      : CLOSE_OUTCOME_TEXT[outcome],
  );
}

export async function closePollCallback(ctx: CallbackQueryContext<Context>): Promise<void> {
  const data = ctx.callbackQuery.data ?? "";
  const parts = data.split(":");
  const pollId = parts[1];
  const action = parts[2];

  const poll = await getPollById(pollId);
  if (!poll || !poll.pendingResult) {
    await ctx.editMessageText("Этот опрос уже обработан.");
    await ctx.answerCallbackQuery();
    return;
  }

  if (action === "cancel") {
    if (!(await resolvePendingResult(pollId, null))) {
      await ctx.editMessageText("Этот опрос уже обработан.");
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.editMessageText("Отмечено: в этот раз никуда не ездили, место не исключается.");
    await ctx.answerCallbackQuery();
    return;
  }

  const suggestionId = parts[3];
  if (!poll.pendingResult.candidateSuggestionIds.includes(suggestionId)) {
    await ctx.editMessageText("Эта кнопка устарела — такого варианта нет среди итогов опроса.");
    await ctx.answerCallbackQuery();
    return;
  }
  const suggestion = await getSuggestionById(suggestionId);
  if (!suggestion) {
    await ctx.editMessageText("Это предложение больше не существует.");
    await ctx.answerCallbackQuery();
    return;
  }

  // Confirmed on Sunday (or later) — the trip was the Saturday before.
  const tripDate = tripDateFor(now(), env.defaultTimezone);
  if (!(await resolvePendingResult(pollId, suggestionId, tripDate))) {
    await ctx.editMessageText("Этот опрос уже обработан.");
    await ctx.answerCallbackQuery();
    return;
  }
  await excludeSuggestion(suggestionId);
  await ctx.editMessageText(`Отмечено: ${formatIsoDate(tripDate)} съездили в "${suggestion.text}".`);
  await ctx.answerCallbackQuery();
  // Ask the people who went (voted for this place) by name — a direct
  // mention gets far more photos into the archive than a general request.
  const trip = { pollId, suggestionId, tripDate, optionSuggestionIds: poll.optionSuggestionIds };
  const riders = ridersOf(trip, await listVotesForPoll(pollId));
  const mentions = riders.map((r) => mentionHtml(r.userId, r.username)).join(", ");
  const photoAsk = `ответьте на фото с поездки командой /photo ${suggestion.seq} — они попадут в архив места (/place ${suggestion.seq}).`;
  await ctx.api.sendMessage(
    poll.groupChatId,
    `Съездили в «${escapeHtml(suggestion.text)}»!\n` +
      (riders.length > 0 ? `${mentions}, вы ездили — ${photoAsk}` : `Сохраните фото: ${photoAsk}`),
    { parse_mode: "HTML" },
  );
}

export const closePollCallbackPattern = new RegExp(`^${CLOSE_POLL_CALLBACK_PREFIX}:`);
