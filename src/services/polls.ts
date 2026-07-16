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

export async function getPollsWithPendingResult(): Promise<PollDocWithId[]> {
  const snap = await polls.where("status", "==", "closed").get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as PollDoc) }))
    .filter((poll) => poll.pendingResult !== null);
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
  };
  const ref = await polls.add(doc);
  const snap = await ref.get();
  return { id: ref.id, ...(snap.data() as PollDoc) };
}

export async function setPendingResult(
  pollId: string,
  pendingResult: PendingResult,
): Promise<void> {
  await polls.doc(pollId).update({
    status: "closed",
    closedAt: FieldValue.serverTimestamp(),
    pendingResult,
  });
}

export async function closeWithoutWinner(pollId: string): Promise<void> {
  await polls.doc(pollId).update({
    status: "closed",
    closedAt: FieldValue.serverTimestamp(),
    winnerSuggestionId: null,
    pendingResult: null,
  });
}

export async function finalizeWinner(
  pollId: string,
  winnerSuggestionId: string,
): Promise<void> {
  await polls.doc(pollId).update({
    winnerSuggestionId,
    pendingResult: null,
  });
}

export async function cancelPendingResult(pollId: string): Promise<void> {
  await polls.doc(pollId).update({
    winnerSuggestionId: null,
    pendingResult: null,
  });
}

export async function getPollById(pollId: string): Promise<PollDocWithId | null> {
  const snap = await polls.doc(pollId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as PollDoc) };
}
