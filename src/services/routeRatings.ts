import { FieldValue } from "firebase-admin/firestore";
import { db } from "../firebase/firestore.js";
import type { RouteRating } from "../types/index.js";
import { summarize, type ServantSummary } from "../utils/servantScale.js";

const ratings = db.collection("routeRatings");

// One rating per member per trip; tapping again changes it.
export async function rateRoute(pollId: string, suggestionId: string, userId: number, score: number): Promise<void> {
  await ratings.doc(`${pollId}_${userId}`).set({
    pollId,
    suggestionId,
    userId,
    score,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// Across every trip to the place: the route is the same each time.
export async function servantSummaryFor(suggestionId: string): Promise<ServantSummary | null> {
  const snap = await ratings.where("suggestionId", "==", suggestionId).get();
  return summarize(snap.docs.map((doc) => (doc.data() as RouteRating).score));
}

// Every rated place at once, for /list.
export async function allServantSummaries(): Promise<Map<string, ServantSummary>> {
  const snap = await ratings.get();
  const scores = new Map<string, number[]>();
  for (const doc of snap.docs) {
    const { suggestionId, score } = doc.data() as RouteRating;
    scores.set(suggestionId, [...(scores.get(suggestionId) ?? []), score]);
  }
  return new Map([...scores].map(([id, list]) => [id, summarize(list)!]));
}
