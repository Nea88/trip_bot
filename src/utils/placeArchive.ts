import { buildMessageLink, describeItems } from "./photoMessage.js";
import { formatUserName } from "./userName.js";

export interface ArchiveItem {
  batchId: string;
  fileId: string | null;
  sourceChatId: number;
  sourceMessageId: number;
  addedAt: Date;
  addedByUsername: string;
  addedByHasUsername: boolean;
}

export interface ArchiveEntry {
  date: Date;
  // "4 фото", "1 сообщение".
  what: string;
  author: string;
  // Original message in the group; for an album, its first photo.
  link: string;
}

/**
 * One entry per /photo submission (a batch): an album becomes a single link
 * instead of one per photo. Entries are in the order they were added.
 */
export function groupArchive(items: ArchiveItem[]): ArchiveEntry[] {
  const batches = new Map<string, ArchiveItem[]>();
  for (const item of [...items].sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())) {
    const batch = batches.get(item.batchId);
    if (batch) batch.push(item);
    else batches.set(item.batchId, [item]);
  }
  return [...batches.values()].map((batch) => {
    const first = batch.reduce((min, item) => (item.sourceMessageId < min.sourceMessageId ? item : min));
    return {
      date: batch[0].addedAt,
      what: describeItems(batch),
      author: formatUserName(batch[0].addedByUsername, batch[0].addedByHasUsername),
      link: buildMessageLink(first.sourceChatId, first.sourceMessageId),
    };
  });
}
