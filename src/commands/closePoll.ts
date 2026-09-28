import type { CallbackQueryContext, Context } from "grammy";
import { DateTime } from "luxon";
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
  const suggestion = await getSuggestionById(suggestionId);
  if (!suggestion) {
    await ctx.editMessageText("Это предложение больше не существует.");
    await ctx.answerCallbackQuery();
    return;
  }

  // Confirmed on Sunday (or later) — the trip was the Saturday before.
  const tripDate = tripDateFor(DateTime.now(), env.defaultTimezone);
  if (!(await resolvePendingResult(pollId, suggestionId, tripDate))) {
    await ctx.editMessageText("Этот опрос уже обработан.");
    await ctx.answerCallbackQuery();
    return;
  }
  await excludeSuggestion(suggestionId);
  await ctx.editMessageText(`Отмечено: ${formatIsoDate(tripDate)} съездили в "${suggestion.text}".`);
  await ctx.answerCallbackQuery();
  await ctx.api.sendMessage(
    poll.groupChatId,
    `Съездили в "${suggestion.text}"! Сохраните фото с поездки: ответьте на них командой /photo ${suggestion.seq} — они попадут в архив места (/place ${suggestion.seq}).`,
  );
}

export const closePollCallbackPattern = new RegExp(`^${CLOSE_POLL_CALLBACK_PREFIX}:`);
