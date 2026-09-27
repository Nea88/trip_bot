import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { PlacePhoto, PlacePhotoStatus, PlacePhotoWithId } from "../types/index.js";

const placePhotos = db.collection("placePhotos");
const suggestions = db.collection("suggestions");

// Firestore caps a write batch at 500 operations.
const MAX_BATCH_WRITES = 500;

export interface NewPlacePhoto {
  fileId: string;
  fileUniqueId: string;
  sourceChatId: number;
  sourceMessageId: number;
}

export interface PhotoAuthor {
  userId: number;
  username: string;
  hasUsername: boolean;
}

function withId(doc: FirebaseFirestore.QueryDocumentSnapshot): PlacePhotoWithId {
  return { id: doc.id, ...(doc.data() as PlacePhoto) };
}

// Status of photos already attached to (or submitted for) this place, keyed
// by fileUniqueId — so the same photo can't be added twice.
export async function getExistingStatuses(
  suggestionId: string,
): Promise<Map<string, PlacePhotoStatus>> {
  const snap = await placePhotos.where("suggestionId", "==", suggestionId).get();
  return new Map(snap.docs.map((doc) => {
    const photo = doc.data() as PlacePhoto;
    return [photo.fileUniqueId, photo.status];
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
): Promise<{ suggestionId: string; count: number } | null> {
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
    return { suggestionId, count: pending.length };
  });
}

export async function listApprovedForSuggestion(suggestionId: string): Promise<PlacePhotoWithId[]> {
  const snap = await placePhotos
    .where("suggestionId", "==", suggestionId)
    .where("status", "==", "approved")
    .orderBy("addedAt", "asc")
    .get();
  return snap.docs.map(withId);
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
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(
      placePhotos.where("fileUniqueId", "==", fileUniqueId).where("status", "==", "approved"),
    );
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
