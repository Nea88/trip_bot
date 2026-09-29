import type { Api } from "grammy";
import { listActiveSuggestions } from "./suggestions.js";
import { createPoll, getOpenPoll, listAllPolls } from "./polls.js";
import { lastShownAtFromPolls, pickPollOptions } from "../utils/rotation.js";
import type { PollDocWithId } from "../types/index.js";
import { MAX_REAL_POLL_OPTIONS, MIMOKROKODIL_TEXT } from "../constants.js";

export type CreatePollResult =
  | { kind: "already_open" }
  | { kind: "no_suggestions" }
  | { kind: "created"; poll: PollDocWithId; optionCount: number };

export async function createPollIfPossible(
  api: Api,
  groupChatId: number,
): Promise<CreatePollResult> {
  const openPoll = await getOpenPoll(groupChatId);
  if (openPoll) {
    return { kind: "already_open" };
  }

  const active = await listActiveSuggestions();
  if (active.length === 0) {
    return { kind: "no_suggestions" };
  }

  const lastShownAt = lastShownAtFromPolls(
    (await listAllPolls()).map((p) => ({
      optionSuggestionIds: p.optionSuggestionIds,
      createdAt: p.createdAt?.toMillis() ?? 0,
    })),
  );
  const chosen = pickPollOptions(
    active.map((s) => ({ ...s, addedAt: s.addedAt?.toMillis() ?? 0, suggestion: s })),
    lastShownAt,
    MAX_REAL_POLL_OPTIONS,
  ).map((c) => c.suggestion);
  const optionTexts = [...chosen.map((s) => s.text), MIMOKROKODIL_TEXT];
  const optionSuggestionIds: (string | null)[] = [...chosen.map((s) => s.id), null];

  const message = await api.sendPoll(groupChatId, "Куда поедем в этот раз?", optionTexts, {
    is_anonymous: false,
    allows_multiple_answers: false,
  });

  const poll = await createPoll(
    groupChatId,
    message.poll.id,
    message.message_id,
    optionSuggestionIds,
  );

  try {
    await api.pinChatMessage(groupChatId, message.message_id);
  } catch (err) {
    console.error("[pollCreation] Failed to pin poll message:", err);
  }

  return { kind: "created", poll, optionCount: optionTexts.length };
}
