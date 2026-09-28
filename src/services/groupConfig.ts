import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { GroupConfig } from "../types/index.js";
import { env } from "../config/env.js";

const configDoc = db.collection("config").doc("main");

// This process is the only writer of the config doc, so an in-memory copy
// stays accurate as long as every setter below drops it. Saves a Firestore
// read (sometimes several) on every command.
let cached: GroupConfig | null = null;

export async function getGroupConfig(): Promise<GroupConfig> {
  if (!cached) cached = await loadGroupConfig();
  return cached;
}

async function updateConfig(fields: Record<string, unknown>): Promise<void> {
  await configDoc.set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  // Drop after the write, so a read that raced with it can't re-cache stale data.
  cached = null;
}

async function loadGroupConfig(): Promise<GroupConfig> {
  const snap = await configDoc.get();
  if (!snap.exists) {
    const seeded: GroupConfig = {
      groupChatId: env.groupChatId,
      scheduleDay: null,
      scheduleTime: null,
      timezone: null,
      reminderTime: null,
      reminderTimezone: null,
      reminderText: null,
      lastReminderSentDate: null,
      updatedAt: FieldValue.serverTimestamp() as unknown as GroupConfig["updatedAt"],
    };
    await configDoc.set(seeded);
    const fresh = await configDoc.get();
    return fresh.data() as GroupConfig;
  }

  const data = snap.data() as GroupConfig;
  // GROUP_CHAT_ID is deployment config (env var / addon option), not
  // user-editable data — it must always win over whatever was seeded into
  // Firestore on some earlier run (e.g. a stale/wrong value, or a group that
  // later migrated to a supergroup and got a new chat id).
  if (data.groupChatId !== env.groupChatId) {
    await configDoc.set(
      { groupChatId: env.groupChatId, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { ...data, groupChatId: env.groupChatId };
  }
  return data;
}

export async function setSchedule(
  day: number,
  time: string,
  timezone: string,
): Promise<void> {
  await updateConfig({
    scheduleDay: day,
    scheduleTime: time,
    timezone,
    scheduleSetAt: FieldValue.serverTimestamp(),
  });
}

export async function setCloseSchedule(
  day: number,
  time: string,
  timezone: string,
): Promise<void> {
  await updateConfig({
    closeScheduleDay: day,
    closeScheduleTime: time,
    closeTimezone: timezone,
    closeScheduleSetAt: FieldValue.serverTimestamp(),
  });
}

export async function setReminderSchedule(time: string, timezone: string): Promise<void> {
  await updateConfig({ reminderTime: time, reminderTimezone: timezone });
}

export async function setReminderText(text: string): Promise<void> {
  await updateConfig({ reminderText: text });
}

export async function markReminderSent(isoDate: string): Promise<void> {
  await updateConfig({ lastReminderSentDate: isoDate });
}

export async function markMemoriesSent(isoDate: string): Promise<void> {
  await updateConfig({ lastMemoriesSentDate: isoDate });
}
