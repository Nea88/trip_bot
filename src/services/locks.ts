import { db } from "../firebase/firestore.js";
import { now } from "../utils/clock.js";

const locks = db.collection("locks");

/**
 * Short-lived mutex in Firestore. Returns false if someone else holds it.
 * The TTL frees it even if the holder crashes before releasing.
 */
export async function acquireLock(name: string, ttlMs: number): Promise<boolean> {
  const ref = locks.doc(name);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = now().toMillis();
    if (snap.exists && (snap.data()!.expiresAt as number) > current) return false;
    tx.set(ref, { expiresAt: current + ttlMs });
    return true;
  });
}

export async function releaseLock(name: string): Promise<void> {
  await locks.doc(name).delete();
}
