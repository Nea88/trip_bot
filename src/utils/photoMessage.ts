import type { Api } from "grammy";
import type { PhotoSize } from "grammy/types";
import { pluralRu } from "./plural.js";

// Telegram albums (sendMediaGroup) hold 2–10 items.
const MAX_ALBUM_SIZE = 10;

// Telegram sends every photo in several sizes, smallest first.
export function largestPhoto(message: { photo?: PhotoSize[] }): PhotoSize | null {
  const sizes = message.photo;
  return sizes && sizes.length > 0 ? sizes[sizes.length - 1] : null;
}

// Works for supergroups, whose ids look like -100<internal id>.
export function buildMessageLink(chatId: number, messageId: number): string {
  const internalId = String(chatId).replace(/^-100/, "");
  return `https://t.me/c/${internalId}/${messageId}`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function photoBadge(photoCount: number | undefined): string {
  return photoCount ? ` 📷 ${photoCount}` : "";
}

export interface PlaceItemRef {
  fileId: string | null;
  sourceChatId: number;
  sourceMessageId: number;
}

/**
 * Sends a place's items: photos as albums, other messages as copies of the
 * original. A copy fails if the original was deleted — those are skipped and
 * counted, so one lost message doesn't hide the rest.
 */
export async function sendPlaceItems(api: Api, chatId: number, items: PlaceItemRef[]): Promise<number> {
  const fileIds = items.flatMap((item) => (item.fileId ? [item.fileId] : []));
  await sendPhotoAlbums(api, chatId, fileIds);

  let failed = 0;
  for (const item of items) {
    if (item.fileId) continue;
    try {
      await api.copyMessage(chatId, item.sourceChatId, item.sourceMessageId);
    } catch (err) {
      console.error(`[place] Failed to copy message ${item.sourceMessageId}:`, err);
      failed++;
    }
  }
  return failed;
}

// Sends photos as albums of up to 10; a lone leftover photo can't be an
// album, so it goes out as a plain photo.
export async function sendPhotoAlbums(api: Api, chatId: number, fileIds: string[]): Promise<void> {
  for (const group of chunk(fileIds, MAX_ALBUM_SIZE)) {
    if (group.length === 1) {
      await api.sendPhoto(chatId, group[0]);
    } else {
      await api.sendMediaGroup(
        chatId,
        group.map((fileId) => ({ type: "photo" as const, media: fileId })),
      );
    }
  }
}

// "3 фото", "1 сообщение", "2 фото и 1 сообщение".
export function describeItems(items: { fileId: string | null }[]): string {
  const photos = items.filter((item) => item.fileId).length;
  const messages = items.length - photos;
  const parts: string[] = [];
  if (photos > 0) parts.push(`${photos} фото`);
  if (messages > 0) parts.push(`${messages} ${pluralRu(messages, ["сообщение", "сообщения", "сообщений"])}`);
  return parts.join(" и ");
}
