import type { Api } from "grammy";
import { DateTime } from "luxon";
import type { Timestamp } from "firebase-admin/firestore";
import { env } from "../config/env.js";
import { now } from "../utils/clock.js";
import { formatYearSummary } from "../utils/yearSummary.js";
import { getGroupConfig } from "./groupConfig.js";
import { listAllSuggestions } from "./suggestions.js";
import { listAllApproved } from "./placePhotos.js";
import { listVotes } from "./pollVotes.js";
import { listTrips } from "./trips.js";

const isoDay = (ts: Timestamp | null | undefined) =>
  ts ? DateTime.fromJSDate(ts.toDate()).setZone(env.defaultTimezone).toISODate() : null;

export async function buildYearSummary(year: number): Promise<string> {
  const [suggestions, trips, votes, archive] = await Promise.all([
    listAllSuggestions(),
    listTrips(),
    listVotes(),
    listAllApproved(),
  ]);
  return formatYearSummary(year, {
    suggestions: suggestions.map((s) => ({ ...s, addedOn: isoDay(s.addedAt) })),
    trips,
    votes,
    archive: archive.map((a) => ({ ...a, addedOn: isoDay(a.addedAt) ?? "" })),
  });
}

// December 31: post the year in review, unless there were no trips at all.
export async function postYearSummary(api: Api): Promise<void> {
  const year = now().setZone(env.defaultTimezone).year;
  const text = await buildYearSummary(year);
  if (!text.startsWith("🎉")) return;
  const config = await getGroupConfig();
  await api.sendMessage(config.groupChatId, text);
}
