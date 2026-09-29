import type { SuggestionStatus } from "../types/index.js";
import { describeItems } from "./photoMessage.js";
import { formatIsoDate } from "./tripDate.js";
import { pluralRu } from "./plural.js";
import { tripsJoined, type Trip, type VoteRecord } from "./participation.js";

export interface UserStatsInput {
  suggestions: { status: SuggestionStatus; addedByUserId: number; id: string; text: string }[];
  trips: Trip[];
  // Poll answers (at least the user's own).
  votes: VoteRecord[];
  // The user's archive items and their status.
  archive: { fileId: string | null; status: "pending" | "approved" | "rejected" }[];
}

/**
 * "/me": trips the user went on (voted for the place the group went to),
 * their ideas and trips made to them, and what they added to the archive.
 */
export function formatUserStats(userId: number, name: string, input: UserStatsInput): string {
  const placeText = new Map(input.suggestions.map((s) => [s.id, s.text]));
  const describeTrips = (trips: Trip[]) =>
    trips.map((t) => `${formatIsoDate(t.tripDate)} «${placeText.get(t.suggestionId) ?? "место удалено"}»`).join(", ");

  const mine = input.suggestions.filter((s) => s.addedByUserId === userId);
  const active = mine.filter((s) => s.status === "active").length;
  const excluded = mine.filter((s) => s.status === "excluded").length;
  const pendingIdeas = mine.filter((s) => s.status === "pending").length;
  const approvedIdeas = active + excluded;
  const myIdeaIds = new Set(mine.map((s) => s.id));

  const joined = tripsJoined(userId, input.trips, input.votes);
  const toMyIdeas = input.trips
    .filter((t) => myIdeaIds.has(t.suggestionId))
    .sort((a, b) => a.tripDate.localeCompare(b.tripDate));

  const approvedArchive = input.archive.filter((a) => a.status === "approved");
  const pendingArchive = input.archive.filter((a) => a.status === "pending");

  const lines = [`Статистика ${name}:`];
  lines.push(
    joined.length > 0
      ? `Поездки: ${joined.length} — ${describeTrips(joined)}`
      : "Поездок пока нет (считаются по голосу в опросе за место, куда в итоге съездили).",
  );
  lines.push(
    approvedIdeas > 0
      ? `Идеи: ${approvedIdeas} (в пуле — ${active}, уже не в пуле — ${excluded})`
      : "Идей пока нет — предложите: /suggest <куда>",
  );
  if (toMyIdeas.length > 0) {
    lines.push(`Съездили по вашим идеям: ${toMyIdeas.length} — ${describeTrips(toMyIdeas)}`);
  } else if (approvedIdeas > 0) {
    lines.push("По вашим идеям пока не ездили.");
  }
  lines.push(
    approvedArchive.length > 0
      ? `В архиве от вас: ${describeItems(approvedArchive)}`
      : "В архиве от вас пока ничего нет.",
  );

  const waiting: string[] = [];
  if (pendingIdeas > 0) {
    waiting.push(`${pendingIdeas} ${pluralRu(pendingIdeas, ["предложение", "предложения", "предложений"])}`);
  }
  if (pendingArchive.length > 0) waiting.push(describeItems(pendingArchive));
  if (waiting.length > 0) lines.push(`Ждут модерации: ${waiting.join(" и ")}`);
  return lines.join("\n");
}
