import type { Context } from "grammy";
import { getBySeq } from "../services/suggestions.js";
import { listApprovedForSuggestion } from "../services/placePhotos.js";
import { listWinsForSuggestion } from "../services/polls.js";
import { chunkLines } from "../utils/messageChunks.js";
import { describeItems } from "../utils/photoMessage.js";
import { groupArchive } from "../utils/placeArchive.js";
import { escapeHtml } from "../utils/html.js";
import type { SuggestionStatus } from "../types/index.js";

// Keeps /place readable; the newest entries are the ones shown.
const MAX_SHOWN_ENTRIES = 30;

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

  const lines = [
    `#${seq}: ${escapeHtml(suggestion.text)}`,
    `Статус: ${STATUS_LABELS[suggestion.status]}`,
  ];
  const tripDates = wins
    .map((poll) => poll.closedAt?.toDate().toLocaleDateString("ru-RU"))
    .filter((date): date is string => Boolean(date));
  lines.push(tripDates.length > 0 ? `Поездки: ${tripDates.join(", ")}` : "Поездок сюда через бота ещё не было.");

  if (photos.length === 0) {
    lines.push(`Архив пока пуст. Добавить: ответьте на фото или сообщение командой /photo ${seq}`);
  } else {
    // Links to the original messages in the group — one per /photo, so an
    // album is a single link.
    const entries = groupArchive(
      photos.map((p) => ({ ...p, addedAt: p.addedAt.toDate(), addedByHasUsername: p.addedByHasUsername !== false })),
    );
    const shown = entries.slice(-MAX_SHOWN_ENTRIES);
    lines.push("", `В архиве: ${describeItems(photos)}`);
    if (shown.length < entries.length) {
      lines.push(`Показаны последние ${shown.length} из ${entries.length} записей.`);
    }
    shown.forEach((entry, i) => {
      const date = entry.date.toLocaleDateString("ru-RU");
      lines.push(`${i + 1}. ${date} — <a href="${entry.link}">${entry.what}</a> от ${escapeHtml(entry.author)}`);
    });
  }

  for (const chunk of chunkLines(lines)) {
    await ctx.reply(chunk, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  }
}
