import type { PhotoSize } from "grammy/types";
import type { MediaGroupCache } from "../services/mediaGroupCache.js";
import { largestPhoto } from "./photoMessage.js";

export interface NewPlacePhoto {
  fileId: string | null;
  fileUniqueId: string | null;
  sourceChatId: number;
  sourceMessageId: number;
}

// The parts of the replied-to message /photo looks at.
export interface RepliedMessage {
  message_id: number;
  media_group_id?: string;
  photo?: PhotoSize[];
}

// A photo is identified by its file (the same picture re-posted is still a
// duplicate); any other message by where it was posted.
export function placeItemKey(
  item: Pick<NewPlacePhoto, "fileUniqueId" | "sourceChatId" | "sourceMessageId">,
): string {
  return item.fileUniqueId ?? `msg:${item.sourceChatId}:${item.sourceMessageId}`;
}

/**
 * What /photo attaches for a reply: a photo by file (the whole album if the
 * bot saw it), any other message by reference to the original.
 * `albumIncomplete` means the photo is from an album the bot doesn't remember
 * (e.g. posted before a restart), so only the replied-to photo is taken.
 */
export function collectReplyItems(
  reply: RepliedMessage,
  chatId: number,
  albums: MediaGroupCache,
): { items: NewPlacePhoto[]; albumIncomplete: boolean } {
  const photo = largestPhoto(reply);
  if (photo && reply.media_group_id) {
    const album = albums.get(reply.media_group_id);
    if (album.some((p) => p.messageId === reply.message_id)) {
      return {
        items: album.map((p) => ({
          fileId: p.fileId,
          fileUniqueId: p.fileUniqueId,
          sourceChatId: chatId,
          sourceMessageId: p.messageId,
        })),
        albumIncomplete: false,
      };
    }
  }
  return {
    items: [
      {
        fileId: photo?.file_id ?? null,
        fileUniqueId: photo?.file_unique_id ?? null,
        sourceChatId: chatId,
        sourceMessageId: reply.message_id,
      },
    ],
    albumIncomplete: Boolean(photo && reply.media_group_id),
  };
}
