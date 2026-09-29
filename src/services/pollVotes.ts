import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { PollVote } from "../types/index.js";

const votes = db.collection("pollVotes");

export interface Voter {
  userId: number;
  username: string;
  hasUsername: boolean;
}

/**
 * Stores a member's current answer; an empty answer means they retracted
 * their vote, so the record goes away.
 */
export async function recordVote(pollId: string, voter: Voter, optionIndexes: number[]): Promise<void> {
  const ref = votes.doc(`${pollId}_${voter.userId}`);
  if (optionIndexes.length === 0) {
    await ref.delete();
    return;
  }
  await ref.set({
    pollId,
    userId: voter.userId,
    username: voter.username,
    hasUsername: voter.hasUsername,
    optionIndexes,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listVotes(): Promise<PollVote[]> {
  const snap = await votes.get();
  return snap.docs.map((doc) => doc.data() as PollVote);
}

export async function listVotesByUser(userId: number): Promise<PollVote[]> {
  const snap = await votes.where("userId", "==", userId).get();
  return snap.docs.map((doc) => doc.data() as PollVote);
}
