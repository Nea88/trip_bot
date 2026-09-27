import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { PendingResult, PollDoc, PollDocWithId } from "../types/index.js";

const polls = db.collection("polls");

export async function getOpenPoll(groupChatId: number): Promise<PollDocWithId | null> {
  const snap = await polls
    .where("groupChatId", "==", groupChatId)
    .where("status", "==", "open")
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as PollDoc) };
}

// Pending results whose confirmation message was never posted (e.g. the bot
// died right after stopPoll). Ones already posted are skipped so restarts
// don't spam the group with duplicate confirmation messages.
export async function getPollsWithUnpostedPendingResult(): Promise<PollDocWithId[]> {
  const snap = await polls.where("status", "==", "closed").get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as PollDoc) }))
    .filter((poll) => poll.pendingResult !== null && poll.pendingResultMessageId == null);
}

export async function createPoll(
  groupChatId: number,
  telegramPollId: string,
  messageId: number,
  optionSuggestionIds: (string | null)[],
): Promise<PollDocWithId> {
  const doc: PollDoc = {
    telegramPollId,
    messageId,
    groupChatId,
    optionSuggestionIds,
    createdAt: FieldValue.serverTimestamp() as unknown as PollDoc["createdAt"],
    closedAt: null,
    status: "open",
    winnerSuggestionId: null,
    pendingResult: null,
    pendingResultMessageId: null,
  };
  const ref = await polls.add(doc);
  const snap = await ref.get();
  return { id: ref.id, ...(snap.data() as PollDoc) };
}

/**
 * Atomically flips an open poll to "closed". Returns false if someone else
 * already closed it — callers must bail out then, so two concurrent
 * /close_poll (or /cancel_poll) runs can't both process the same poll.
 */
export async function claimOpenPoll(pollId: string): Promise<boolean> {
  const ref = polls.doc(pollId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || (snap.data() as PollDoc).status !== "open") return false;
    tx.update(ref, { status: "closed", closedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

// Undoes claimOpenPoll when stopping the Telegram poll failed transiently.
export async function reopenPoll(pollId: string): Promise<void> {
  await polls.doc(pollId).update({ status: "open", closedAt: null });
}

export async function setPendingResult(
  pollId: string,
  pendingResult: PendingResult,
): Promise<void> {
  await polls.doc(pollId).update({ pendingResult, pendingResultMessageId: null });
}

export async function setPendingResultMessageId(
  pollId: string,
  messageId: number,
): Promise<void> {
  await polls.doc(pollId).update({ pendingResultMessageId: messageId });
}

export async function closeWithoutWinner(pollId: string): Promise<void> {
  await polls.doc(pollId).update({
    status: "closed",
    closedAt: FieldValue.serverTimestamp(),
    winnerSuggestionId: null,
    pendingResult: null,
  });
}

/**
 * Atomically resolves a pending result: records the winner (or null when
 * cancelled) and clears pendingResult. Returns false if it was already
 * resolved — e.g. a double tap or two admins pressing buttons at once.
 */
export async function resolvePendingResult(
  pollId: string,
  winnerSuggestionId: string | null,
): Promise<boolean> {
  const ref = polls.doc(pollId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || (snap.data() as PollDoc).pendingResult === null) return false;
    tx.update(ref, { winnerSuggestionId, pendingResult: null });
    return true;
  });
}

export async function getPollById(pollId: string): Promise<PollDocWithId | null> {
  const snap = await polls.doc(pollId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as PollDoc) };
}
