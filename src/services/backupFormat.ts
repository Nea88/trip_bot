import { Timestamp } from "firebase-admin/firestore";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupFile {
  version: number;
  createdAt: string;
  // collection → document id → fields
  collections: Record<string, Record<string, Record<string, unknown>>>;
}

interface SerializedTimestamp {
  __timestamp: { seconds: number; nanoseconds: number };
}

function isSerializedTimestamp(value: unknown): value is SerializedTimestamp {
  return typeof value === "object" && value !== null && "__timestamp" in value;
}

// Firestore values → plain JSON; Timestamps keep full precision.
export function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { __timestamp: { seconds: value.seconds, nanoseconds: value.nanoseconds } };
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeValue(v)]));
  }
  return value;
}

export function deserializeValue(value: unknown): unknown {
  if (isSerializedTimestamp(value)) {
    return new Timestamp(value.__timestamp.seconds, value.__timestamp.nanoseconds);
  }
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deserializeValue(v)]));
  }
  return value;
}

export function backupFileName(isoDate: string): string {
  return `ride-bot-backup-${isoDate}.json`;
}

/**
 * Writes the backup into `dir` (one file per day — a second run the same day
 * overwrites it) and keeps only the newest `keep` backups.
 */
export async function saveBackupFile(dir: string, isoDate: string, json: string, keep: number): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, backupFileName(isoDate));
  await writeFile(path, json);

  // Names embed the ISO date, so lexical order is chronological.
  const backups = (await readdir(dir)).filter((f) => /^ride-bot-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    await rm(join(dir, old));
  }
  return path;
}
