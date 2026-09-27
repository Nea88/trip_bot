import type { Context } from "grammy";
import { listClosedPolls } from "../services/polls.js";
import { listAllSuggestions } from "../services/suggestions.js";
import { getFirstApprovedPhotoSources } from "../services/placePhotos.js";
import { computeHistory, type HistorySuggestion } from "../services/historyStats.js";
import { chunkLines } from "../utils/messageChunks.js";
import { buildMessageLink, photoBadge } from "../utils/photoMessage.js";
import { escapeHtml } from "../utils/html.js";
import { pluralRu } from "../utils/plural.js";
import { formatUserName } from "../utils/userName.js";

const MAX_SHOWN_TRIPS = 10;
const TOP_LIMIT = 5;

export async function historyCommand(ctx: Context): Promise<void> {
  const [polls, suggestions, photoSources] = await Promise.all([
    listClosedPolls(),
    listAllSuggestions(),
    getFirstApprovedPhotoSources(),
  ]);

  // "#12 Дача 📷 5 · фото" — the link opens the place's first photo in the group.
  const formatPlace = (s: HistorySuggestion): string => {
    const source = photoSources.get(s.id);
    const link = source
      ? ` · <a href="${buildMessageLink(source.chatId, source.messageId)}">фото</a>`
      : "";
    return `#${s.seq} ${escapeHtml(s.text)}${photoBadge(s.photoCount)}${link}`;
  };
  const { trips, topAuthors, topLosers } = computeHistory(
    polls.map((p) => ({
      optionSuggestionIds: p.optionSuggestionIds,
      winnerSuggestionId: p.winnerSuggestionId,
      closedAt: p.closedAt?.toDate() ?? null,
    })),
    suggestions.map((s) => ({ ...s, addedAt: s.addedAt?.toDate() ?? null })),
    TOP_LIMIT,
  );

  const lines: string[] = [];

  if (trips.length === 0) {
    lines.push("Поездок через бота ещё не было.");
  } else {
    const shown = trips.slice(0, MAX_SHOWN_TRIPS);
    lines.push(
      trips.length > shown.length
        ? `Поездки (всего ${trips.length}, последние ${shown.length}):`
        : `Поездки (${trips.length}):`,
    );
    for (const { date, suggestion } of shown) {
      const when = date ? date.toLocaleDateString("ru-RU") : "дата неизвестна";
      const place = suggestion ? formatPlace(suggestion) : "(место удалено)";
      lines.push(`• ${when} — ${place}`);
    }
  }

  if (topAuthors.length > 0) {
    lines.push("", "Самые активные авторы идей:");
    topAuthors.forEach((a, i) => {
      const name = escapeHtml(formatUserName(a.username, a.hasUsername));
      const ideas = `${a.ideas} ${pluralRu(a.ideas, ["идея", "идеи", "идей"])}`;
      const wins = a.wins > 0 ? `, ${a.wins} ${pluralRu(a.wins, ["победа", "победы", "побед"])}` : "";
      lines.push(`${i + 1}. ${name} — ${ideas}${wins}`);
    });
  }

  if (topLosers.length > 0) {
    lines.push("", "Чаще всего проигрывали:");
    topLosers.forEach(({ suggestion, losses, appearances }, i) => {
      const polls = pluralRu(appearances, ["опроса", "опросов", "опросов"]);
      lines.push(`${i + 1}. ${formatPlace(suggestion)} — ${losses} из ${appearances} ${polls}`);
    });
  }

  for (const chunk of chunkLines(lines)) {
    await ctx.reply(chunk, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  }
}
