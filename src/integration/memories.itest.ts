import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { photoCommand } from "../commands/photo.js";
import { sendTripMemories } from "../services/memories.js";
import { addSuggestion, approveSuggestion } from "../services/suggestions.js";
import { claimOpenPoll, createPoll, resolvePendingResult } from "../services/polls.js";
import { db } from "../firebase/firestore.js";
import { ADMIN_ID, GROUP_CHAT_ID, clearFirestore, createFakeApi, createFakeCtx, photoSizes } from "./harness.js";

beforeEach(clearFirestore);

const now = DateTime.fromISO("2026-09-28T12:00", { zone: "Europe/Moscow" });

// A confirmed trip to a new place on the given day.
async function addTrip(text: string, tripDay: DateTime): Promise<string> {
  const place = await addSuggestion(text, ADMIN_ID, "admin", true);
  await approveSuggestion(place.id);
  const poll = await createPoll(GROUP_CHAT_ID, "tg", 1, [place.id, null]);
  await claimOpenPoll(poll.id);
  await db.collection("polls").doc(poll.id).update({
    pendingResult: { candidateSuggestionIds: [place.id], voterCounts: [1] },
  });
  await resolvePendingResult(poll.id, place.id, tripDay.toISODate());
  return place.id;
}

test("posts once a day about trips on this day, with archive links", async () => {
  await addTrip("дача", now.minus({ years: 1 }));
  await addTrip("вчерашнее место", now.minus({ years: 1, days: 1 }));
  const { api, callsTo } = createFakeApi();
  await photoCommand(
    createFakeCtx(api, { userId: ADMIN_ID, match: "1", replyTo: { message_id: 42, photo: photoSizes("m") } }).ctx,
  );

  await sendTripMemories(api, now);
  const posts = callsTo("sendMessage").filter((c) => /В этот день/.test(c.args[1] as string));
  assert.equal(posts.length, 1);
  const text = posts[0].args[1] as string;
  assert.match(text, /1 год назад мы ездили: #1 дача/);
  assert.match(text, /<a href="https:\/\/t\.me\/c\/1000\/42">1 фото<\/a> от @user1/);
  assert.doesNotMatch(text, /вчерашнее место/);

  await sendTripMemories(api, now.plus({ hours: 3 }));
  assert.equal(callsTo("sendMessage").filter((c) => /В этот день/.test(c.args[1] as string)).length, 1);
});

test("trips confirmed before tripDate existed are dated by the Saturday before closing", async () => {
  // Legacy poll: no tripDate, closed on Sunday 2025-09-28 → trip was Saturday 2025-09-27.
  const place = await addTrip("старая поездка", now);
  const [poll] = (await db.collection("polls").where("winnerSuggestionId", "==", place).get()).docs;
  await poll.ref.update({
    tripDate: null,
    closedAt: DateTime.fromISO("2025-09-28T12:00", { zone: "Europe/Moscow" }).toJSDate(),
  });

  const { api, callsTo } = createFakeApi();
  await sendTripMemories(api, DateTime.fromISO("2026-09-28T12:00", { zone: "Europe/Moscow" }));
  assert.equal(callsTo("sendMessage").length, 0, "not on the closing day");

  await sendTripMemories(api, DateTime.fromISO("2026-09-27T12:00", { zone: "Europe/Moscow" }));
  assert.equal(callsTo("sendMessage").length, 1, "on the Saturday before it");
  assert.match(callsTo("sendMessage")[0].args[1] as string, /1 год назад мы ездили: #1 старая поездка/);
});

test("stays silent when no trip has an anniversary today", async () => {
  await addTrip("дача", now.minus({ years: 1, days: 2 }));
  const { api, callsTo } = createFakeApi();
  await sendTripMemories(api, now);
  assert.equal(callsTo("sendMessage").length, 0);
});
