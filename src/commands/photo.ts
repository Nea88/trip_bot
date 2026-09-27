import { InlineKeyboard, type CallbackQueryContext, type Context } from "grammy";
import { getById, getBySeq } from "../services/suggestions.js";
import {
  addPhotoBatch,
  getExistingStatuses,
  removeApprovedByFileUniqueId,
  resolveBatch,
  type NewPlacePhoto,
} from "../services/placePhotos.js";
import { mediaGroupCache } from "../services/mediaGroupCache.js";
import { notifyAdminsWithPhotos } from "../services/notifications.js";
import { getGroupConfig } from "../services/groupConfig.js";
import { isGroupAdmin } from "../services/adminAuth.js";
import { largestPhoto } from "../utils/photoMessage.js";
import { formatUserName } from "../utils/userName.js";

const CALLBACK_PREFIX = "ph";
const USAGE =
  "Ответьте на сообщение с фото командой /photo <номер места>, например: /photo 12. Номера мест — в /list и /excluded.";

export async function photoCommand(ctx: Context): Promise<void> {
  const arg = ctx.match?.toString().trim();
  const seq = Number(arg);
  const reply = ctx.message?.reply_to_message;
  if (!arg || !Number.isInteger(seq) || !reply) {
    await ctx.reply(USAGE);
    return;
  }
  const repliedPhoto = largestPhoto(reply);
  if (!repliedPhoto) {
    await ctx.reply(`В сообщении, на которое вы ответили, нет фото.\n${USAGE}`);
    return;
  }

  const suggestion = await getBySeq(seq);
  if (!suggestion) {
    await ctx.reply(`Место #${seq} не найдено.`);
    return;
  }
  if (suggestion.status !== "active" && suggestion.status !== "excluded") {
    await ctx.reply(`К #${seq} нельзя прикрепить фото — этот вариант ещё не одобрен или отклонён.`);
    return;
  }

  // A reply to an album only carries the one photo; the rest come from the cache.
  const chatId = ctx.chat!.id;
  const album = reply.media_group_id ? mediaGroupCache.get(reply.media_group_id) : [];
  const albumKnown = album.some((p) => p.messageId === reply.message_id);
  const photos: NewPlacePhoto[] = albumKnown
    ? album.map((p) => ({
        fileId: p.fileId,
        fileUniqueId: p.fileUniqueId,
        sourceChatId: chatId,
        sourceMessageId: p.messageId,
      }))
    : [
        {
          fileId: repliedPhoto.file_id,
          fileUniqueId: repliedPhoto.file_unique_id,
          sourceChatId: chatId,
          sourceMessageId: reply.message_id,
        },
      ];
  const albumNote =
    reply.media_group_id && !albumKnown
      ? `\nАльбом целиком не нашёл — ответьте /photo ${seq} на остальные фото из него.`
      : "";

  const existing = await getExistingStatuses(suggestion.id);
  const fresh = photos.filter((p) => !existing.has(p.fileUniqueId));
  if (fresh.length === 0) {
    await ctx.reply(`Эти фото уже есть у #${seq} (прикреплены, ждут модерации или отклонены).${albumNote}`);
    return;
  }
  const skippedNote = fresh.length < photos.length ? ` (${photos.length - fresh.length} уже были)` : "";
  const place = `#${seq} «${suggestion.text}»`;

  const from = ctx.from!;
  const author = {
    userId: from.id,
    username: from.username ?? from.first_name ?? "кто-то",
    hasUsername: Boolean(from.username),
  };
  const config = await getGroupConfig();
  const isAdmin = await isGroupAdmin(ctx.api, config.groupChatId, from.id);

  const batchId = await addPhotoBatch(suggestion.id, fresh, author, isAdmin);

  if (isAdmin) {
    await ctx.reply(`Добавлено ${fresh.length} фото к ${place}${skippedNote}. Смотреть: /place ${seq}${albumNote}`);
    return;
  }

  await ctx.reply(`Отправлено на модерацию: ${fresh.length} фото к ${place}${skippedNote}.${albumNote}`);

  const keyboard = new InlineKeyboard()
    .text("Одобрить", `${CALLBACK_PREFIX}:${batchId}:approve`)
    .text("Отклонить", `${CALLBACK_PREFIX}:${batchId}:reject`);
  await notifyAdminsWithPhotos(
    ctx.api,
    config.groupChatId,
    fresh.map((p) => p.fileId),
    `${formatUserName(author.username, author.hasUsername)} хочет добавить ${fresh.length} фото к ${place}`,
    keyboard,
  );
}

export async function photoReviewCallback(ctx: CallbackQueryContext<Context>): Promise<void> {
  const data = ctx.callbackQuery.data ?? "";
  const [, batchId, action] = data.split(":");
  const approve = action === "approve";

  const resolved = await resolveBatch(batchId, approve);
  if (!resolved) {
    await ctx.editMessageText("Эти фото уже обработаны.");
    await ctx.answerCallbackQuery();
    return;
  }

  const suggestion = await getById(resolved.suggestionId);
  const place = suggestion ? `#${suggestion.seq} «${suggestion.text}»` : "удалённому месту";
  await ctx.editMessageText(`${approve ? "Одобрено" : "Отклонено"}: ${resolved.count} фото к ${place}`);
  await ctx.answerCallbackQuery();

  if (approve && suggestion) {
    const config = await getGroupConfig();
    await ctx.api.sendMessage(
      config.groupChatId,
      `Добавлено ${resolved.count} фото к ${place}. Смотреть: /place ${suggestion.seq}`,
    );
  }
}

export async function unphotoCommand(ctx: Context): Promise<void> {
  const reply = ctx.message?.reply_to_message;
  const photo = reply ? largestPhoto(reply) : null;
  if (!photo) {
    await ctx.reply(
      "Ответьте командой /unphoto на фото, которое нужно убрать из архива (исходное в группе или из /place).",
    );
    return;
  }

  const removed = await removeApprovedByFileUniqueId(photo.file_unique_id);
  await ctx.reply(removed > 0 ? "Фото убрано из архива." : "Это фото не прикреплено ни к одному месту.");
}

export const photoReviewCallbackPattern = new RegExp(`^${CALLBACK_PREFIX}:`);
