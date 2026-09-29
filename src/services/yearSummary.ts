import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { Timestamp } from "firebase-admin/firestore";
import { env } from "../config/env.js";
import { now } from "../utils/clock.js";
import { formatYearSummary, type YearSummaryInput } from "../utils/yearSummary.js";
import { getGroupConfig, markYearSummaryHandled } from "./groupConfig.js";
import { listAllSuggestions } from "./suggestions.js";
import { listAllApproved } from "./placePhotos.js";
import { listVotes } from "./pollVotes.js";
import { listTrips } from "./trips.js";

const isoDay = (ts: Timestamp | null | undefined) =>
  ts ? DateTime.fromJSDate(ts.toDate()).setZone(env.defaultTimezone).toISODate() : null;

// Everything the year summary and /top count: ideas, trips, votes, archive.
export async function loadYearData(): Promise<YearSummaryInput> {
  const [suggestions, trips, votes, archive] = await Promise.all([
    listAllSuggestions(),
    listTrips(),
    listVotes(),
    listAllApproved(),
  ]);
  return {
    suggestions: suggestions.map((s) => ({ ...s, addedOn: isoDay(s.addedAt) })),
    trips,
    votes,
    archive: archive.map((a) => ({ ...a, addedOn: isoDay(a.addedAt) ?? "" })),
  };
}

export async function buildYearSummary(year: number): Promise<string> {
  return formatYearSummary(year, await loadYearData());
}

/**
 * December 31 (or a catch-up in early January): post the year in review,
 * unless there were no trips at all. Either way the year counts as handled.
 */
export async function postYearSummary(api: Api, year = now().setZone(env.defaultTimezone).year): Promise<void> {
  const text = await buildYearSummary(year);
  if (text.startsWith("🎉")) {
    const config = await getGroupConfig();
    await api.sendMessage(config.groupChatId, text);
  }
  await markYearSummaryHandled(year);
}
