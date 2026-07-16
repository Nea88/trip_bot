import { InlineKeyboard, type Api, type CallbackQueryContext, type Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import {
  getOpenPoll,
  setPendingResult,
  closeWithoutWinner,
  finalizeWinner,
  cancelPendingResult,
  getPollById,
} from "../services/polls.js";
import { getById as getSuggestionById, excludeSuggestion } from "../services/suggestions.js";
import { computeWinner } from "../services/pollWinner.js";
import type { PollDocWithId } from "../types/index.js";
import { MIMOKROKODIL_TEXT, MIMOKROKODIL_TOKEN } from "../constants.js";

const CALLBACK_PREFIX = "cp";

export async function closePollCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  const openPoll = await getOpenPoll(config.groupChatId);
  if (!openPoll) {
    await ctx.reply("Сейчас нет открытого опроса.");
    return;
  }

  const finalPoll = await ctx.api.stopPoll(config.groupChatId, openPoll.messageId);
  const voterCounts = finalPoll.options.map((o) => o.voter_count);
  const winner = computeWinner(
    openPoll.optionSuggestionIds,
    voterCounts,
    finalPoll.total_voter_count,
  );

  if (winner.kind === "no_votes") {
    await closeWithoutWinner(openPoll.id);
    await ctx.reply("Опрос закрыт: никто не проголосовал, место не исключается.");
    return;
  }

  await setPendingResult(openPoll.id, {
    candidateSuggestionIds: winner.candidateSuggestionIds,
    voterCounts: winner.voterCounts,
  });

  const updatedPoll = await getPollById(openPoll.id);
  await postPendingResultMessage(ctx.api, updatedPoll!);
}

export async function postPendingResultMessage(
  api: Api,
  poll: PollDocWithId,
): Promise<void> {
  if (!poll.pendingResult) return;
  const { candidateSuggestionIds, voterCounts } = poll.pendingResult;
  const isTie = candidateSuggestionIds.length > 1;

  const keyboard = new InlineKeyboard();
  for (let index = 0; index < candidateSuggestionIds.length; index++) {
    const suggestionId = candidateSuggestionIds[index];
    const count = voterCounts[index];

    if (suggestionId === null) {
      const label = isTie
        ? `Выбрать: ${MIMOKROKODIL_TEXT} (${count})`
        : `Подтвердить: ${MIMOKROKODIL_TEXT} (${count})`;
      keyboard.text(label, `${CALLBACK_PREFIX}:${poll.id}:confirm:${MIMOKROKODIL_TOKEN}`).row();
      continue;
    }

    const suggestion = await getSuggestionById(suggestionId);
    if (!suggestion) continue;
    const label = isTie
      ? `Выбрать: ${suggestion.text} (${count})`
      : `Подтвердить: ${suggestion.text} (${count})`;
    keyboard.text(label, `${CALLBACK_PREFIX}:${poll.id}:confirm:${suggestion.id}`).row();
  }
  keyboard.text("Отмена", `${CALLBACK_PREFIX}:${poll.id}:cancel`);

  const text = isTie ? "Ничья! Выберите победителя вручную:" : "Опрос закрыт. Подтвердите победителя:";

  await api.sendMessage(poll.groupChatId, text, { reply_markup: keyboard });
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
    await cancelPendingResult(pollId);
    await ctx.editMessageText("Отменено: победитель не зафиксирован, место не исключается.");
    await ctx.answerCallbackQuery();
    return;
  }

  const suggestionId = parts[3];

  if (suggestionId === MIMOKROKODIL_TOKEN) {
    await cancelPendingResult(pollId);
    await ctx.editMessageText(`Победил вариант «${MIMOKROKODIL_TEXT}» — в этот раз никуда не едем.`);
    await ctx.answerCallbackQuery();
    return;
  }

  const suggestion = await getSuggestionById(suggestionId);
  if (!suggestion) {
    await ctx.editMessageText("Это предложение больше не существует.");
    await ctx.answerCallbackQuery();
    return;
  }

  await finalizeWinner(pollId, suggestionId);
  await excludeSuggestion(suggestionId);
  await ctx.editMessageText(`Победитель: "${suggestion.text}"!`);
  await ctx.answerCallbackQuery();
  await ctx.api.sendMessage(
    poll.groupChatId,
    `Едем в: "${suggestion.text}"! Хорошей поездки!`,
  );
}

export const closePollCallbackPattern = new RegExp(`^${CALLBACK_PREFIX}:`);
