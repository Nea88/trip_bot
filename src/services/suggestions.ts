import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { Suggestion, SuggestionWithId } from "../types/index.js";

const suggestions = db.collection("suggestions");
const counterDoc = db.collection("counters").doc("suggestionSeq");

async function nextSeq(): Promise<number> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterDoc);
    const current = snap.exists ? (snap.data()!.value as number) : 0;
    const next = current + 1;
    tx.set(counterDoc, { value: next }, { merge: true });
    return next;
  });
}

export function normalizeSuggestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function findByNormalizedText(
  normalized: string,
): Promise<SuggestionWithId | null> {
  const snap = await suggestions.where("textNormalized", "==", normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Suggestion) };
}

export async function addSuggestion(
  text: string,
  addedByUserId: number,
  addedByUsername: string,
): Promise<SuggestionWithId> {
  const seq = await nextSeq();
  const doc: Suggestion = {
    seq,
    text,
    textNormalized: normalizeSuggestionText(text),
    addedByUserId,
    addedByUsername,
    addedAt: FieldValue.serverTimestamp() as unknown as Suggestion["addedAt"],
    status: "active",
    excludedAt: null,
    restoredAt: null,
  };
  const ref = await suggestions.add(doc);
  const snap = await ref.get();
  return { id: ref.id, ...(snap.data() as Suggestion) };
}

export async function listActiveSuggestions(): Promise<SuggestionWithId[]> {
  const snap = await suggestions
    .where("status", "==", "active")
    .orderBy("addedAt", "asc")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Suggestion) }));
}

export async function listExcludedSuggestions(): Promise<SuggestionWithId[]> {
  const snap = await suggestions
    .where("status", "==", "excluded")
    .orderBy("excludedAt", "desc")
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Suggestion) }));
}

export async function getBySeq(seq: number): Promise<SuggestionWithId | null> {
  const snap = await suggestions.where("seq", "==", seq).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Suggestion) };
}

export async function editSuggestionText(id: string, newText: string): Promise<void> {
  await suggestions.doc(id).update({
    text: newText,
    textNormalized: normalizeSuggestionText(newText),
  });
}

export async function deleteSuggestion(id: string): Promise<void> {
  await suggestions.doc(id).delete();
}

export async function excludeSuggestion(id: string): Promise<void> {
  await suggestions.doc(id).update({
    status: "excluded",
    excludedAt: FieldValue.serverTimestamp(),
  });
}

export async function restoreSuggestion(id: string): Promise<void> {
  await suggestions.doc(id).update({
    status: "active",
    restoredAt: FieldValue.serverTimestamp(),
  });
}

export async function getById(id: string): Promise<SuggestionWithId | null> {
  const snap = await suggestions.doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Suggestion) };
}
