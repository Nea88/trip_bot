import type { Context } from "grammy";
import { getBySeq } from "../services/suggestions.js";
import { listApprovedForSuggestion } from "../services/placePhotos.js";
import { listWinsForSuggestion } from "../services/polls.js";
import { chunkLines } from "../utils/messageChunks.js";
import { describeItems, sendPlaceItems } from "../utils/photoMessage.js";
import { formatUserName } from "../utils/userName.js";
import type { SuggestionStatus } from "../types/index.js";

// Keeps /place from flooding the chat; the newest photos are the ones shown.
const MAX_SHOWN_PHOTOS = 50;

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  active: "в пуле вариантов",
  excluded: "исключено из пула",
  pending: "ждёт одобрения админа",
  rejected: "отклонено",
};

export async function placeCommand(ctx: Context): Promise<void> {
  const arg = ctx.match?.toString().trim();
  const seq = Number(arg);
  if (!arg || !Number.isInteger(seq)) {
    await ctx.reply("Использование: /place <номер>. Номера мест — в /list и /excluded.");
    return;
  }

  const suggestion = await getBySeq(seq);
  if (!suggestion) {
    await ctx.reply(`Место #${seq} не найдено.`);
    return;
  }

  const [photos, wins] = await Promise.all([
    listApprovedForSuggestion(suggestion.id),
    listWinsForSuggestion(suggestion.id),
  ]);

  const lines = [`#${seq}: ${suggestion.text}`, `Статус: ${STATUS_LABELS[suggestion.status]}`];
  const tripDates = wins
    .map((poll) => poll.closedAt?.toDate().toLocaleDateString("ru-RU"))
    .filter((date): date is string => Boolean(date));
  lines.push(tripDates.length > 0 ? `Поездки: ${tripDates.join(", ")}` : "Поездок сюда через бота ещё не было.");

  if (photos.length === 0) {
    lines.push(`Архив пока пуст. Добавить: ответьте на фото или сообщение командой /photo ${seq}`);
  } else {
    const authors = [
      ...new Set(photos.map((p) => formatUserName(p.addedByUsername, p.addedByHasUsername))),
    ];
    lines.push(`В архиве: ${describeItems(photos)} (добавили: ${authors.join(", ")})`);
    if (photos.length > MAX_SHOWN_PHOTOS) {
      lines.push(`Показаны последние ${MAX_SHOWN_PHOTOS} из ${photos.length}.`);
    }
  }

  for (const chunk of chunkLines(lines)) {
    await ctx.reply(chunk);
  }

  if (photos.length === 0) return;
  let failed = 0;
  try {
    failed = await sendPlaceItems(ctx.api, ctx.chat!.id, photos.slice(-MAX_SHOWN_PHOTOS));
  } catch (err) {
    console.error(`[place] Failed to send photos for #${seq}:`, err);
    failed = 1;
  }
  if (failed > 0) {
    await ctx.reply("Не удалось показать часть архива — возможно, исходные сообщения удалили.");
  }
}
