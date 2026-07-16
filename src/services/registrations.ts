import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { AdminRegistration } from "../types/index.js";

const registrations = db.collection("adminRegistrations");

export async function registerForNotifications(
  userId: number,
  dmChatId: number,
  username: string,
): Promise<void> {
  const doc: AdminRegistration = {
    dmChatId,
    username,
    registeredAt: FieldValue.serverTimestamp() as unknown as AdminRegistration["registeredAt"],
  };
  await registrations.doc(String(userId)).set(doc);
}

export async function getAllRegistrations(): Promise<
  { userId: number; registration: AdminRegistration }[]
> {
  const snap = await registrations.get();
  return snap.docs.map((doc) => ({
    userId: Number(doc.id),
    registration: doc.data() as AdminRegistration,
  }));
}
