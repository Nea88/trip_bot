import { GrammyError, InlineKeyboard, type Api } from "grammy";
import { DateTime } from "luxon";
import {
  getOpenPoll,
  claimOpenPoll,
  reopenPoll,
  setPendingResult,
  setPendingResultMessageId,
  closeWithoutWinner,
  getPollById,
} from "./polls.js";
import { getById as getSuggestionById } from "./suggestions.js";
import { computeWinner } from "./pollWinner.js";
import { env } from "../config/env.js";
import { tripDateFor } from "../utils/tripDate.js";
import type { PollDocWithId } from "../types/index.js";

export const CLOSE_POLL_CALLBACK_PREFIX = "cp";

export type CloseOutcome =
  | "no_open_poll"
  | "already_closing"
  | "message_gone"
  | "no_votes"
  | "awaiting_confirmation";

// What to tell the group for each outcome; awaiting_confirmation posts its
// own message with buttons.
export const CLOSE_OUTCOME_TEXT: Record<Exclude<CloseOutcome, "awaiting_confirmation">, string> = {
  no_open_poll: "Сейчас нет открытого опроса.",
  already_closing: "Этот опрос уже закрывается.",
  message_gone:
    "Не удалось найти сообщение с опросом (похоже, его удалили) — опрос закрыт без результатов, место не исключается.",
  no_votes:
    "Опрос закрыт: за реальные варианты никто не проголосовал (или все выбрали «Мимокрокодил») — место не исключается.",
};

async function unpinPollMessage(api: Api, groupChatId: number, messageId: number): Promise<void> {
  try {
    await api.unpinChatMessage(groupChatId, messageId);
  } catch (err) {
    console.error("[pollClosing] Failed to unpin poll message:", err);
  }
}

/**
 * Stops the open poll and counts it. With real votes, posts the "where did
 * you go" confirmation for admins; otherwise closes it without a winner.
 * Used by /close_poll and by the weekly auto-close.
 */
export async function closeOpenPoll(api: Api, groupChatId: number): Promise<CloseOutcome> {
  const openPoll = await getOpenPoll(groupChatId);
  if (!openPoll) return "no_open_poll";
  if (!(await claimOpenPoll(openPoll.id))) return "already_closing";

  let finalPoll;
  try {
    finalPoll = await api.stopPoll(groupChatId, openPoll.messageId);
  } catch (err) {
    if (err instanceof GrammyError) {
      // Poll message was deleted (or is otherwise gone) — no way to get
      // results, so just close it out instead of leaving it stuck "open".
      await closeWithoutWinner(openPoll.id);
      await unpinPollMessage(api, groupChatId, openPoll.messageId);
      return "message_gone";
    }
    await reopenPoll(openPoll.id);
    throw err;
  }
  await unpinPollMessage(api, groupChatId, openPoll.messageId);
  const voterCounts = finalPoll.options.map((o) => o.voter_count);
  const winner = computeWinner(openPoll.optionSuggestionIds, voterCounts);

  if (winner.kind === "no_votes") {
    await closeWithoutWinner(openPoll.id);
    return "no_votes";
  }

  await setPendingResult(openPoll.id, {
    candidateSuggestionIds: winner.candidateSuggestionIds,
    voterCounts: winner.voterCounts,
  });
  const updatedPoll = await getPollById(openPoll.id);
  await postPendingResultMessage(api, updatedPoll!);
  return "awaiting_confirmation";
}

export async function cancelOpenPoll(
  api: Api,
  groupChatId: number,
): Promise<"no_open_poll" | "already_closing" | "cancelled"> {
  const openPoll = await getOpenPoll(groupChatId);
  if (!openPoll) return "no_open_poll";
  if (!(await claimOpenPoll(openPoll.id))) return "already_closing";

  try {
    await api.stopPoll(groupChatId, openPoll.messageId);
  } catch (err) {
    // Poll message may already be deleted — nothing to stop, just close it out.
    if (!(err instanceof GrammyError)) {
      await reopenPoll(openPoll.id);
      throw err;
    }
  }
  await closeWithoutWinner(openPoll.id);
  await unpinPollMessage(api, groupChatId, openPoll.messageId);
  return "cancelled";
}

// "26.09" — the Saturday the admin is asked about.
function lastTripDayLabel(): string {
  return DateTime.fromISO(tripDateFor(DateTime.now(), env.defaultTimezone)).toFormat("dd.LL");
}

/**
 * Asks admins where the group actually went on Saturday: one button per top
 * option (several on a tie) plus "didn't go".
 */
export async function postPendingResultMessage(api: Api, poll: PollDocWithId): Promise<void> {
  if (!poll.pendingResult) return;
  const { candidateSuggestionIds, voterCounts } = poll.pendingResult;
  const isTie = candidateSuggestionIds.length > 1;

  const keyboard = new InlineKeyboard();
  for (let index = 0; index < candidateSuggestionIds.length; index++) {
    const suggestion = await getSuggestionById(candidateSuggestionIds[index]);
    if (!suggestion) continue;
    keyboard
      .text(`Съездили: ${suggestion.text} (${voterCounts[index]})`, `${CLOSE_POLL_CALLBACK_PREFIX}:${poll.id}:confirm:${suggestion.id}`)
      .row();
  }
  keyboard.text("Никуда не ездили", `${CLOSE_POLL_CALLBACK_PREFIX}:${poll.id}:cancel`);

  const day = lastTripDayLabel();
  const text = isTie
    ? `Опрос закрыт, ничья. Куда съездили в субботу ${day}? (для админов)`
    : `Опрос закрыт. Подтвердите, куда съездили в субботу ${day} (для админов):`;

  const message = await api.sendMessage(poll.groupChatId, text, { reply_markup: keyboard });
  await setPendingResultMessageId(poll.id, message.message_id);
}
