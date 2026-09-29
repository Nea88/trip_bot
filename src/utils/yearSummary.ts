import { formatUserName } from "./userName.js";
import { pluralRu } from "./plural.js";
import { formatIsoDate } from "./tripDate.js";
import { topRiders, type Trip, type VoteRecord } from "./participation.js";

export interface YearSummaryInput {
  suggestions: {
    id: string;
    seq: number;
    text: string;
    status: string;
    addedByUserId: number;
    addedByUsername: string;
    addedByHasUsername?: boolean;
    // ISO date the idea was added.
    addedOn: string | null;
  }[];
  trips: Trip[];
  votes: VoteRecord[];
  // Approved archive items.
  archive: {
    suggestionId: string;
    addedByUserId: number;
    addedByUsername: string;
    addedByHasUsername: boolean;
    addedOn: string;
  }[];
}

const TOP = 3;
const MAX_TRIPS_LISTED = 20;

function topBy<T>(items: T[], key: (item: T) => number, label: (item: T) => string) {
  const counts = new Map<number, { label: string; count: number }>();
  for (const item of items) {
    const k = key(item);
    const entry = counts.get(k) ?? { label: label(item), count: 0 };
    entry.count++;
    counts.set(k, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, TOP);
}

/**
 * Year in review: trips, places with the most archive items, top idea
 * authors and top contributors to the archive. Plain text.
 */
export function formatYearSummary(year: number, input: YearSummaryInput): string {
  const inYear = (iso: string | null) => iso !== null && iso.startsWith(`${year}-`);
  const byId = new Map(input.suggestions.map((s) => [s.id, s]));

  const trips = input.trips
    .filter((t) => inYear(t.tripDate))
    .sort((a, b) => a.tripDate.localeCompare(b.tripDate));
  if (trips.length === 0) return `В ${year} году поездок через бота не было.`;

  const lines = [`🎉 Итоги ${year} года`, "", `Поездок: ${trips.length}`];
  for (const trip of trips.slice(0, MAX_TRIPS_LISTED)) {
    const place = byId.get(trip.suggestionId);
    lines.push(`• ${formatIsoDate(trip.tripDate)} — ${place ? `#${place.seq} ${place.text}` : "(место удалено)"}`);
  }
  if (trips.length > MAX_TRIPS_LISTED) lines.push(`…и ещё ${trips.length - MAX_TRIPS_LISTED}`);

  const riders = topRiders(trips, input.votes).slice(0, TOP);
  if (riders.length > 0) {
    lines.push("", "Чаще всех ездили:");
    riders.forEach((r, i) =>
      lines.push(
        `${i + 1}. ${formatUserName(r.username, r.hasUsername)} — ${r.trips} ${pluralRu(r.trips, ["поездка", "поездки", "поездок"])}`,
      ),
    );
  }

  const archive = input.archive.filter((a) => inYear(a.addedOn));
  const placeOf = (a: { suggestionId: string }) => byId.get(a.suggestionId)!;
  const topPlaces = topBy(
    archive.filter((a) => byId.has(a.suggestionId)),
    (a) => placeOf(a).seq,
    (a) => `#${placeOf(a).seq} ${placeOf(a).text}`,
  );
  if (topPlaces.length > 0) {
    lines.push("", "Больше всего в архиве:");
    topPlaces.forEach((p, i) => lines.push(`${i + 1}. ${p.label} — ${p.count} 📷`));
  }

  const ideas = input.suggestions.filter(
    (s) => (s.status === "active" || s.status === "excluded") && inYear(s.addedOn),
  );
  const topAuthors = topBy(
    ideas,
    (s) => s.addedByUserId,
    (s) => formatUserName(s.addedByUsername, s.addedByHasUsername !== false),
  );
  if (topAuthors.length > 0) {
    lines.push("", "Главные генераторы идей:");
    topAuthors.forEach((a, i) =>
      lines.push(`${i + 1}. ${a.label} — ${a.count} ${pluralRu(a.count, ["идея", "идеи", "идей"])}`),
    );
  }

  const topArchivists = topBy(
    archive,
    (a) => a.addedByUserId,
    (a) => formatUserName(a.addedByUsername, a.addedByHasUsername),
  );
  if (topArchivists.length > 0) {
    lines.push("", "Больше всех пополнили архив:");
    topArchivists.forEach((a, i) => lines.push(`${i + 1}. ${a.label} — ${a.count}`));
  }

  lines.push("", "Спасибо всем, кто ездил! До встречи в новом году 🏍");
  return lines.join("\n");
}
