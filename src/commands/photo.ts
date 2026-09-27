import { InlineKeyboard, type CallbackQueryContext, type Context } from "grammy";
import { getById, getBySeq } from "../services/suggestions.js";
import {
  addPhotoBatch,
  getExistingStatuses,
  removeApprovedByFileUniqueId,
  removeApprovedBySource,
  resolveBatch,
} from "../services/placePhotos.js";
import { collectReplyItems, placeItemKey } from "../utils/replyItems.js";
import { mediaGroupCache } from "../services/mediaGroupCache.js";
import { notifyAdminsWithItems } from "../services/notifications.js";
import { getGroupConfig } from "../services/groupConfig.js";
import { isGroupAdmin } from "../services/adminAuth.js";
import { buildMessageLink, describeItems, largestPhoto } from "../utils/photoMessage.js";
import { formatUserName } from "../utils/userName.js";

const CALLBACK_PREFIX = "ph";
const USAGE =
  "Ответьте на сообщение (фото, видео, текст — что угодно) командой /photo <номер места>, например: /photo 12. Номера мест — в /list и /excluded.";

export async function photoCommand(ctx: Context): Promise<void> {
  const arg = ctx.match?.toString().trim();
  const seq = Number(arg);
  const reply = ctx.message?.reply_to_message;
  if (!arg || !Number.isInteger(seq) || !reply) {
    await ctx.reply(USAGE);
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

  const { items: photos, albumIncomplete } = collectReplyItems(reply, ctx.chat!.id, mediaGroupCache);
  const albumNote = albumIncomplete
    ? `\nАльбом целиком не нашёл — ответьте /photo ${seq} на остальные фото из него.`
    : "";

  const existing = await getExistingStatuses(suggestion.id);
  const fresh = photos.filter((p) => !existing.has(placeItemKey(p)));
  if (fresh.length === 0) {
    await ctx.reply(`Это уже есть у #${seq} (прикреплено, ждёт модерации или отклонено).${albumNote}`);
    return;
  }
  const skippedNote = fresh.length < photos.length ? ` (${photos.length - fresh.length} уже были)` : "";
  const place = `#${seq} «${suggestion.text}»`;
  const what = describeItems(fresh);

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
    await ctx.reply(`Добавлено ${what} к ${place}${skippedNote}. Смотреть: /place ${seq}${albumNote}`);
    return;
  }

  await ctx.reply(`Отправлено на модерацию: ${what} к ${place}${skippedNote}.${albumNote}`);

  const keyboard = new InlineKeyboard()
    .text("Одобрить", `${CALLBACK_PREFIX}:${batchId}:approve`)
    .text("Отклонить", `${CALLBACK_PREFIX}:${batchId}:reject`);
  await notifyAdminsWithItems(
    ctx.api,
    config.groupChatId,
    fresh,
    `${formatUserName(author.username, author.hasUsername)} хочет добавить ${what} к ${place}\nОригинал: ${buildMessageLink(fresh[0].sourceChatId, fresh[0].sourceMessageId)}`,
    keyboard,
  );
}

export async function photoReviewCallback(ctx: CallbackQueryContext<Context>): Promise<void> {
  const data = ctx.callbackQuery.data ?? "";
  const [, batchId, action] = data.split(":");
  const approve = action === "approve";

  const resolved = await resolveBatch(batchId, approve);
  if (!resolved) {
    await ctx.editMessageText("Это уже обработано.");
    await ctx.answerCallbackQuery();
    return;
  }

  const suggestion = await getById(resolved.suggestionId);
  const place = suggestion ? `#${suggestion.seq} «${suggestion.text}»` : "удалённому месту";
  const what = describeItems(resolved.items);
  await ctx.editMessageText(`${approve ? "Одобрено" : "Отклонено"}: ${what} к ${place}`);
  await ctx.answerCallbackQuery();

  if (approve && suggestion) {
    const config = await getGroupConfig();
    await ctx.api.sendMessage(
      config.groupChatId,
      `Добавлено ${what} к ${place}. Смотреть: /place ${suggestion.seq}`,
    );
  }
}

export async function unphotoCommand(ctx: Context): Promise<void> {
  const reply = ctx.message?.reply_to_message;
  if (!reply) {
    await ctx.reply(
      "Ответьте командой /unphoto на сообщение в группе, которое нужно убрать из архива (ссылки на них — в /place).",
    );
    return;
  }

  // Photos match by file (so any copy of the photo works too); other messages
  // only match the original in the group.
  const photo = largestPhoto(reply);
  const removed = photo
    ? await removeApprovedByFileUniqueId(photo.file_unique_id)
    : await removeApprovedBySource(ctx.chat!.id, reply.message_id);
  await ctx.reply(
    removed > 0
      ? "Убрано из архива."
      : "Это не прикреплено ни к одному месту. Ответьте на исходное сообщение в группе — ссылки на них есть в /place.",
  );
}

export const photoReviewCallbackPattern = new RegExp(`^${CALLBACK_PREFIX}:`);
