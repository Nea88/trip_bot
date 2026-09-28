import { InputFile, type Api } from "grammy";
import { db } from "../firebase/firestore.js";
import { env } from "../config/env.js";
import { now } from "../utils/clock.js";
import { formatIsoDate } from "../utils/tripDate.js";
import { getGroupConfig } from "./groupConfig.js";
import { forEachAdminDm } from "./notifications.js";
import {
  BACKUP_FORMAT_VERSION,
  backupFileName,
  deserializeValue,
  saveBackupFile,
  serializeValue,
  type BackupFile,
} from "./backupFormat.js";

// Weekly backups kept on disk (~2 months).
const KEEP_ON_DISK = 8;
// Firestore caps a write batch at 500 operations.
const MAX_BATCH_WRITES = 500;

export async function exportAll(): Promise<BackupFile> {
  const collections: BackupFile["collections"] = {};
  for (const collection of await db.listCollections()) {
    const snap = await collection.get();
    collections[collection.id] = Object.fromEntries(
      snap.docs.map((doc) => [doc.id, serializeValue(doc.data()) as Record<string, unknown>]),
    );
  }
  return { version: BACKUP_FORMAT_VERSION, createdAt: now().toISO()!, collections };
}

function countDocuments(backup: BackupFile): number {
  return Object.values(backup.collections).reduce((sum, docs) => sum + Object.keys(docs).length, 0);
}

/**
 * Writes a backup back into Firestore under the same ids. Refuses to touch a
 * non-empty database unless `overwrite` is set (then documents from the
 * backup replace existing ones with the same id; others are left alone).
 */
export async function importAll(backup: BackupFile, options: { overwrite: boolean }): Promise<number> {
  if (backup.version !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Неизвестная версия резервной копии: ${backup.version}`);
  }
  if (!options.overwrite) {
    for (const name of Object.keys(backup.collections)) {
      const existing = await db.collection(name).limit(1).get();
      if (!existing.empty) {
        throw new Error(`В базе уже есть данные (коллекция ${name}). Чтобы перезаписать, запустите с --overwrite.`);
      }
    }
  }

  const writes = Object.entries(backup.collections).flatMap(([name, docs]) =>
    Object.entries(docs).map(([id, data]) => ({ ref: db.collection(name).doc(id), data })),
  );
  for (let i = 0; i < writes.length; i += MAX_BATCH_WRITES) {
    const batch = db.batch();
    for (const { ref, data } of writes.slice(i, i + MAX_BATCH_WRITES)) {
      batch.set(ref, deserializeValue(data) as Record<string, unknown>);
    }
    await batch.commit();
  }
  return writes.length;
}

export interface PreparedBackup {
  isoDate: string;
  fileName: string;
  json: string;
  caption: string;
}

export async function prepareBackup(): Promise<PreparedBackup> {
  const backup = await exportAll();
  const today = now().setZone(env.defaultTimezone).toISODate()!;
  return {
    isoDate: today,
    fileName: backupFileName(today),
    json: JSON.stringify(backup, null, 1),
    caption: `Резервная копия базы от ${formatIsoDate(today)}: ${countDocuments(backup)} документов. Восстановление — см. README, раздел «Резервные копии».`,
  };
}

/**
 * Weekly job: saves the backup to BACKUP_DIR (the add-on's /data, which HA
 * includes in its own backups) and sends it to admins in DM.
 */
export async function runBackup(api: Api, dir: string | null = env.backupDir): Promise<void> {
  const prepared = await prepareBackup();
  if (dir) {
    await saveBackupFile(dir, prepared.isoDate, prepared.json, KEEP_ON_DISK);
  }
  const config = await getGroupConfig();
  await forEachAdminDm(api, config.groupChatId, async (dmChatId) => {
    await api.sendDocument(dmChatId, new InputFile(Buffer.from(prepared.json), prepared.fileName), {
      caption: prepared.caption,
    });
  });
}
