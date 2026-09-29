import { InlineKeyboard, type Context } from "grammy";
import { getById, listPendingSuggestions } from "../services/suggestions.js";
import { listPendingBatches } from "../services/placePhotos.js";
import { buildReviewCallbackData } from "./reviewSuggestion.js";
import { photoReviewCallbackData } from "./photo.js";
import { buildMessageLink, describeItems, sendPlaceItems } from "../utils/photoMessage.js";
import { formatUserName } from "../utils/userName.js";

// Keeps /pending from flooding the chat; the oldest requests come first.
const MAX_SHOWN = 10;

/**
 * Re-sends everything waiting for review, with the same buttons as the
 * original DM notifications — for admins who missed or never got them.
 */
export async function pendingCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  const [suggestions, batches] = await Promise.all([listPendingSuggestions(), listPendingBatches()]);
  if (suggestions.length === 0 && batches.length === 0) {
    await ctx.reply("Ничего не ждёт модерации.");
    return;
  }

  await ctx.reply(`Ждут решения: предложений — ${suggestions.length}, фото и сообщений в архив — ${batches.length}.`);

  for (const s of suggestions.slice(0, MAX_SHOWN)) {
    const keyboard = new InlineKeyboard()
      .text("Одобрить", buildReviewCallbackData(s.id, "approve"))
      .text("Отклонить", buildReviewCallbackData(s.id, "reject"));
    await ctx.reply(
      `Предложение от ${formatUserName(s.addedByUsername, s.addedByHasUsername !== false)}:\n#${s.seq}: ${s.text}`,
      { reply_markup: keyboard },
    );
  }

  for (const batch of batches.slice(0, MAX_SHOWN)) {
    const place = await getById(batch.suggestionId);
    const [first] = batch.items;
    await sendPlaceItems(ctx.api, chatId, batch.items);
    const keyboard = new InlineKeyboard()
      .text("Одобрить", photoReviewCallbackData(batch.batchId, "approve"))
      .text("Отклонить", photoReviewCallbackData(batch.batchId, "reject"));
    await ctx.reply(
      `${formatUserName(first.addedByUsername, first.addedByHasUsername)} хочет добавить ${describeItems(batch.items)} к ${place ? `#${place.seq} «${place.text}»` : "удалённому месту"}\nОригинал: ${buildMessageLink(first.sourceChatId, first.sourceMessageId)}`,
      { reply_markup: keyboard },
    );
  }

  const hidden = Math.max(0, suggestions.length - MAX_SHOWN) + Math.max(0, batches.length - MAX_SHOWN);
  if (hidden > 0) {
    await ctx.reply(`Ещё ${hidden} — разберите эти и вызовите /pending снова.`);
  }
}
