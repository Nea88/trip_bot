import type { Context, NextFunction } from "grammy";
import { mediaGroupCache } from "../../services/mediaGroupCache.js";
import { largestPhoto } from "../../utils/photoMessage.js";

// Records every album photo the bot sees, so /photo on one of them can pick
// up the whole album. Never stops the update from reaching other handlers.
export async function rememberAlbumPhotos(ctx: Context, next: NextFunction): Promise<void> {
  const message = ctx.message;
  const photo = message ? largestPhoto(message) : null;
  if (message?.media_group_id && photo) {
    mediaGroupCache.add(message.media_group_id, {
      messageId: message.message_id,
      fileId: photo.file_id,
      fileUniqueId: photo.file_unique_id,
    });
  }
  await next();
}
