import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { LinkDoc, LinkWithId } from "../types/index.js";
import { normalizeUrl } from "../utils/links.js";

const links = db.collection("links");
const counterDoc = db.collection("counters").doc("linkSeq");

function withId(doc: FirebaseFirestore.DocumentSnapshot): LinkWithId {
  return { id: doc.id, ...(doc.data() as LinkDoc) };
}

async function nextSeq(): Promise<number> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterDoc);
    const next = (snap.exists ? (snap.data()!.value as number) : 0) + 1;
    tx.set(counterDoc, { value: next }, { merge: true });
    return next;
  });
}

export interface LinkAuthor {
  userId: number;
  username: string;
  hasUsername: boolean;
}

export async function addLink(url: string, description: string, author: LinkAuthor, approved: boolean): Promise<LinkWithId> {
  const doc: LinkDoc = {
    seq: await nextSeq(),
    url,
    urlNormalized: normalizeUrl(url),
    description,
    addedByUserId: author.userId,
    addedByUsername: author.username,
    addedByHasUsername: author.hasUsername,
    addedAt: FieldValue.serverTimestamp() as unknown as LinkDoc["addedAt"],
    status: approved ? "approved" : "pending",
    reviewedAt: null,
    rejectReason: null,
    rejectPromptChatId: null,
    rejectPromptMessageId: null,
  };
  const ref = await links.add(doc);
  return withId(await ref.get());
}

export async function findByUrl(url: string): Promise<LinkWithId | null> {
  const snap = await links.where("urlNormalized", "==", normalizeUrl(url)).limit(1).get();
  return snap.empty ? null : withId(snap.docs[0]);
}

export async function getLink(id: string): Promise<LinkWithId | null> {
  const snap = await links.doc(id).get();
  return snap.exists ? withId(snap) : null;
}

export async function getLinkBySeq(seq: number): Promise<LinkWithId | null> {
  const snap = await links.where("seq", "==", seq).limit(1).get();
  return snap.empty ? null : withId(snap.docs[0]);
}

async function listByStatus(status: LinkDoc["status"]): Promise<LinkWithId[]> {
  const snap = await links.where("status", "==", status).get();
  return snap.docs.map(withId).sort((a, b) => a.seq - b.seq);
}

export const listApprovedLinks = () => listByStatus("approved");
export const listPendingLinks = () => listByStatus("pending");

/**
 * Atomically moves a pending link to approved/rejected. Returns null if it
 * was already reviewed (double tap, two admins).
 */
export async function reviewLink(
  id: string,
  decision: "approved" | "rejected",
  rejectReason: string | null = null,
): Promise<LinkWithId | null> {
  const ref = links.doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || (snap.data() as LinkDoc).status !== "pending") return null;
    tx.update(ref, { status: decision, reviewedAt: FieldValue.serverTimestamp(), rejectReason });
    return { ...withId(snap), status: decision, rejectReason };
  });
}

// Remembers the "why are you rejecting?" prompt the admin will reply to.
export async function setRejectPrompt(id: string, chatId: number, messageId: number): Promise<void> {
  await links.doc(id).update({ rejectPromptChatId: chatId, rejectPromptMessageId: messageId });
}

export async function findByRejectPrompt(chatId: number, messageId: number): Promise<LinkWithId | null> {
  const snap = await links
    .where("rejectPromptChatId", "==", chatId)
    .where("rejectPromptMessageId", "==", messageId)
    .limit(1)
    .get();
  return snap.empty ? null : withId(snap.docs[0]);
}

export async function deleteLink(id: string): Promise<void> {
  await links.doc(id).delete();
}
