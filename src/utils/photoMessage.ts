import type { Api } from "grammy";
import type { PhotoSize } from "grammy/types";

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
