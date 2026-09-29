import { formatUserName } from "./userName.js";
import { pluralRu } from "./plural.js";
import { topRiders } from "./participation.js";
import type { YearSummaryInput } from "./yearSummary.js";

export interface Ranked {
  label: string;
  count: number;
}

// Counts items per key and returns the top `limit`, most first.
export function topBy<T>(items: T[], key: (item: T) => number, label: (item: T) => string, limit: number): Ranked[] {
  const counts = new Map<number, Ranked>();
  for (const item of items) {
    const k = key(item);
    const entry = counts.get(k) ?? { label: label(item), count: 0 };
    entry.count++;
    counts.set(k, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export const inYear = (year: number, iso: string | null) => iso !== null && iso.startsWith(`${year}-`);

/**
 * /top: the year's leaders in three categories — trips (voted for the place
 * the group went to), approved ideas, and archive contributions.
 */
export function formatTop(year: number, input: YearSummaryInput, limit: number): string {
  const trips = input.trips.filter((t) => inYear(year, t.tripDate));
  const riders: Ranked[] = topRiders(trips, input.votes)
    .slice(0, limit)
    .map((r) => ({ label: formatUserName(r.username, r.hasUsername), count: r.trips }));
  const ideas = topBy(
    input.suggestions.filter((s) => (s.status === "active" || s.status === "excluded") && inYear(year, s.addedOn)),
    (s) => s.addedByUserId,
    (s) => formatUserName(s.addedByUsername, s.addedByHasUsername !== false),
    limit,
  );
  const archive = topBy(
    input.archive.filter((a) => inYear(year, a.addedOn)),
    (a) => a.addedByUserId,
    (a) => formatUserName(a.addedByUsername, a.addedByHasUsername),
    limit,
  );

  if (riders.length === 0 && ideas.length === 0 && archive.length === 0) {
    return `В ${year} году рейтинга пока нет — голосуйте в опросах, предлагайте места (/suggest) и сохраняйте фото (/photo).`;
  }

  const section = (title: string, ranked: Ranked[], unit?: [string, string, string]) =>
    ranked.length === 0
      ? [title, "пока никого"]
      : [title, ...ranked.map((r, i) => `${i + 1}. ${r.label} — ${r.count}${unit ? ` ${pluralRu(r.count, unit)}` : ""}`)];

  return [
    `🏆 Рейтинг ${year} года`,
    "",
    ...section("Поездки:", riders, ["поездка", "поездки", "поездок"]),
    "",
    ...section("Идеи (одобренные):", ideas, ["идея", "идеи", "идей"]),
    "",
    ...section("Пополнили архив (фото и сообщения):", archive),
  ].join("\n");
}
