import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { GroupConfig } from "../types/index.js";
import { env } from "../config/env.js";

const configDoc = db.collection("config").doc("main");

export async function getGroupConfig(): Promise<GroupConfig> {
  const snap = await configDoc.get();
  if (!snap.exists) {
    const seeded: GroupConfig = {
      groupChatId: env.groupChatId,
      scheduleDay: null,
      scheduleTime: null,
      timezone: null,
      updatedAt: FieldValue.serverTimestamp() as unknown as GroupConfig["updatedAt"],
    };
    await configDoc.set(seeded);
    const fresh = await configDoc.get();
    return fresh.data() as GroupConfig;
  }
  return snap.data() as GroupConfig;
}

export async function setSchedule(
  day: number,
  time: string,
  timezone: string,
): Promise<void> {
  await configDoc.set(
    {
      scheduleDay: day,
      scheduleTime: time,
      timezone,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
