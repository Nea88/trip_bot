import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { PlacePhoto, PlacePhotoStatus, PlacePhotoWithId } from "../types/index.js";
import { placeItemKey } from "../utils/replyItems.js";

const placePhotos = db.collection("placePhotos");
const suggestions = db.collection("suggestions");

// Firestore caps a write batch at 500 operations.
const MAX_BATCH_WRITES = 500;

export type { NewPlacePhoto } from "../utils/replyItems.js";
import type { NewPlacePhoto } from "../utils/replyItems.js";

export interface PhotoAuthor {
  userId: number;
  username: string;
  hasUsername: boolean;
}

function withId(doc: FirebaseFirestore.QueryDocumentSnapshot): PlacePhotoWithId {
  return { id: doc.id, ...(doc.data() as PlacePhoto) };
}

// Status of items already attached to (or submitted for) this place, keyed by
// placeItemKey — so the same photo or message can't be added twice.
export async function getExistingStatuses(
  suggestionId: string,
): Promise<Map<string, PlacePhotoStatus>> {
  const snap = await placePhotos.where("suggestionId", "==", suggestionId).get();
  return new Map(snap.docs.map((doc) => {
    const photo = doc.data() as PlacePhoto;
    return [placeItemKey(photo), photo.status];
  }));
}

/**
 * Stores one /photo submission as a batch. Admin submissions are approved
 * right away (and counted on the place); others wait for review.
 */
export async function addPhotoBatch(
  suggestionId: string,
  photos: NewPlacePhoto[],
  author: PhotoAuthor,
  approved: boolean,
): Promise<string> {
  const batchId = placePhotos.doc().id;
  const batch = db.batch();
  for (const photo of photos) {
    const doc: PlacePhoto = {
      suggestionId,
      ...photo,
      batchId,
      addedByUserId: author.userId,
      addedByUsername: author.username,
      addedByHasUsername: author.hasUsername,
      addedAt: FieldValue.serverTimestamp() as unknown as PlacePhoto["addedAt"],
      status: approved ? "approved" : "pending",
      reviewedAt: null,
    };
    batch.set(placePhotos.doc(), doc);
  }
  if (approved) {
    batch.update(suggestions.doc(suggestionId), { photoCount: FieldValue.increment(photos.length) });
  }
  await batch.commit();
  return batchId;
}

/**
 * Atomically approves or rejects a still-pending batch. Returns null if it was
 * already reviewed (double tap, two admins) or no longer exists.
 */
export async function resolveBatch(
  batchId: string,
  approve: boolean,
): Promise<{
  suggestionId: string;
  items: { fileId: string | null }[];
  author: { userId: number; username: string };
} | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(placePhotos.where("batchId", "==", batchId));
    const pending = snap.docs.filter((doc) => (doc.data() as PlacePhoto).status === "pending");
    if (pending.length === 0) return null;

    const suggestionId = (pending[0].data() as PlacePhoto).suggestionId;
    const suggestionRef = suggestions.doc(suggestionId);
    const suggestionSnap = await tx.get(suggestionRef);

    for (const doc of pending) {
      tx.update(doc.ref, {
        status: approve ? "approved" : "rejected",
        reviewedAt: FieldValue.serverTimestamp(),
      });
    }
    if (approve && suggestionSnap.exists) {
      tx.update(suggestionRef, { photoCount: FieldValue.increment(pending.length) });
    }
    const first = pending[0].data() as PlacePhoto;
    return {
      suggestionId,
      items: pending.map((doc) => ({ fileId: (doc.data() as PlacePhoto).fileId })),
      author: { userId: first.addedByUserId, username: first.addedByUsername },
    };
  });
}

// Filtered and sorted in memory: a place has few items, and this way the
// query needs no composite Firestore index.
export async function listApprovedForSuggestion(suggestionId: string): Promise<PlacePhotoWithId[]> {
  const snap = await placePhotos.where("suggestionId", "==", suggestionId).get();
  return snap.docs
    .map(withId)
    .filter((photo) => photo.status === "approved")
    .sort((a, b) => a.addedAt.toMillis() - b.addedAt.toMillis());
}

/**
 * For every place with approved photos, where its earliest photo was posted —
 * used to link each place to its photos in the group.
 */
export async function getFirstApprovedPhotoSources(): Promise<
  Map<string, { chatId: number; messageId: number }>
> {
  const snap = await placePhotos.where("status", "==", "approved").get();
  const earliest = new Map<string, PlacePhoto>();
  for (const doc of snap.docs) {
    const photo = doc.data() as PlacePhoto;
    const current = earliest.get(photo.suggestionId);
    if (!current || photo.addedAt.toMillis() < current.addedAt.toMillis()) {
      earliest.set(photo.suggestionId, photo);
    }
  }
  return new Map(
    [...earliest].map(([id, p]) => [id, { chatId: p.sourceChatId, messageId: p.sourceMessageId }]),
  );
}

/**
 * Removes an approved photo from every place it's attached to (/unphoto).
 * Returns how many attachments were removed.
 */
export async function removeApprovedByFileUniqueId(fileUniqueId: string): Promise<number> {
  return removeApproved(placePhotos.where("fileUniqueId", "==", fileUniqueId));
}

// Same for a non-photo message, identified by where it was posted.
export async function removeApprovedBySource(chatId: number, messageId: number): Promise<number> {
  return removeApproved(
    placePhotos.where("sourceChatId", "==", chatId).where("sourceMessageId", "==", messageId),
  );
}

async function removeApproved(query: FirebaseFirestore.Query): Promise<number> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(query.where("status", "==", "approved"));
    const suggestionRefs = snap.docs.map((doc) =>
      suggestions.doc((doc.data() as PlacePhoto).suggestionId),
    );
    const suggestionSnaps = await Promise.all(suggestionRefs.map((ref) => tx.get(ref)));

    snap.docs.forEach((doc, i) => {
      tx.delete(doc.ref);
      if (suggestionSnaps[i].exists) {
        tx.update(suggestionRefs[i], { photoCount: FieldValue.increment(-1) });
      }
    });
    return snap.size;
  });
}

export async function deleteAllForSuggestion(suggestionId: string): Promise<void> {
  const snap = await placePhotos.where("suggestionId", "==", suggestionId).get();
  for (let i = 0; i < snap.docs.length; i += MAX_BATCH_WRITES) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + MAX_BATCH_WRITES)) batch.delete(doc.ref);
    await batch.commit();
  }
}

export interface PendingBatch {
  batchId: string;
  suggestionId: string;
  items: PlacePhotoWithId[];
}

// Submissions still waiting for an admin, oldest first (for /pending).
export async function listPendingBatches(): Promise<PendingBatch[]> {
  const snap = await placePhotos.where("status", "==", "pending").get();
  const batches = new Map<string, PendingBatch>();
  for (const photo of snap.docs.map(withId)) {
    const batch = batches.get(photo.batchId);
    if (batch) batch.items.push(photo);
    else batches.set(photo.batchId, { batchId: photo.batchId, suggestionId: photo.suggestionId, items: [photo] });
  }
  const addedAt = (b: PendingBatch) => Math.min(...b.items.map((p) => p.addedAt.toMillis()));
  return [...batches.values()].sort((a, b) => addedAt(a) - addedAt(b));
}
