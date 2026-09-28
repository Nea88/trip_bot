import { DateTime } from "luxon";
import type { ArchiveEntry } from "./placeArchive.js";
import { escapeHtml } from "./html.js";
import { pluralRu } from "./plural.js";

// How many archive links a memory post shows per trip; the rest is in /place.
export const MAX_MEMORY_LINKS = 3;

export interface PastTrip {
  suggestionId: string;
  date: Date;
}

export interface Anniversary {
  suggestionId: string;
  yearsAgo: number;
}

/**
 * Trips that happened on today's month and day in an earlier year, most
 * recent first. Feb 29 trips only come up in leap years.
 */
export function findAnniversaries(trips: PastTrip[], now: DateTime, timezone: string): Anniversary[] {
  const today = now.setZone(timezone);
  return trips
    .map((trip) => ({ trip, date: DateTime.fromJSDate(trip.date).setZone(timezone) }))
    .filter(({ date }) => date.month === today.month && date.day === today.day && date.year < today.year)
    .map(({ trip, date }) => ({ suggestionId: trip.suggestionId, yearsAgo: today.year - date.year }))
    .sort((a, b) => a.yearsAgo - b.yearsAgo);
}

export interface MemoryItem {
  seq: number;
  text: string;
  yearsAgo: number;
  entries: ArchiveEntry[];
}

// HTML message (parse_mode: "HTML") for the group.
export function formatMemories(items: MemoryItem[]): string {
  const blocks = items.map(({ seq, text, yearsAgo, entries }) => {
    const when = `${yearsAgo} ${pluralRu(yearsAgo, ["год", "года", "лет"])} назад`;
    const lines = [`${when} мы ездили: #${seq} ${escapeHtml(text)}`];
    if (entries.length === 0) {
      lines.push(`Фото с той поездки в архиве нет — если сохранились, ответьте на них /photo ${seq}`);
    } else {
      const links = entries
        .slice(0, MAX_MEMORY_LINKS)
        .map((e) => `<a href="${e.link}">${e.what}</a> от ${escapeHtml(e.author)}`);
      lines.push(links.join(" · "));
      lines.push(`Весь архив: /place ${seq}`);
    }
    return lines.join("\n");
  });
  return ["📅 В этот день", ...blocks].join("\n\n");
}
