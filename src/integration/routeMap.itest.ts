import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { InputFile } from "grammy";
import { PNG } from "pngjs";
import { createPollCommand } from "../commands/createPoll.js";
import { editCommand } from "../commands/edit.js";
import { routeMapCommand } from "../commands/routeMap.js";
import { geoPointAnswerHandler } from "../commands/geoPointAnswer.js";
import { addSuggestion, approveSuggestion, getBySeq } from "../services/suggestions.js";
import { registerForNotifications } from "../services/registrations.js";
import { getOpenPoll } from "../services/polls.js";
import { getGeoPrompt } from "../services/geoPoints.js";
import { setGeocodeFetcher } from "../services/geocoding.js";
import { setTileFetcher } from "../services/routeMap.js";
import { setShortLinkFetcher } from "../services/coordinates.js";
import {
  ADMIN_ID,
  BOT_ID,
  GROUP_CHAT_ID,
  OWNER_DM,
  OWNER_ID,
  clearFirestore,
  createFakeApi,
  createFakeCtx,
  type ApiCall,
} from "./harness.js";

const KNOWN: Record<string, { lat: string; lon: string }> = {
  Семёновка: { lat: "40.659", lon: "44.9006" },
  Цовагюх: { lat: "40.632", lon: "44.9583" },
  Гош: { lat: "40.7297", lon: "44.9958" },
  Дилижан: { lat: "40.7406", lon: "44.8636" },
};

const tile = PNG.sync.write(new PNG({ width: 256, height: 256 }));

let geocoded: string[];
let tilesFetched: number;

beforeEach(async () => {
  await clearFirestore();
  await registerForNotifications(OWNER_ID, OWNER_DM, "owner");
  geocoded = [];
  tilesFetched = 0;
  setGeocodeFetcher(async (url) => {
    const q = new URL(url).searchParams.get("q")!;
    geocoded.push(q);
    return Response.json(KNOWN[q] ? [KNOWN[q]] : []);
  });
  setTileFetcher(async () => {
    tilesFetched++;
    return new Response(tile);
  });
});

async function addPlaces(...texts: string[]): Promise<void> {
  for (const text of texts) {
    const s = await addSuggestion(text, ADMIN_ID, "admin", true);
    await approveSuggestion(s.id);
  }
}

async function openPoll() {
  const fake = createFakeApi();
  await createPollCommand(createFakeCtx(fake.api, { userId: ADMIN_ID }).ctx);
  return fake;
}

const captionOf = (call: ApiCall) => (call.args[2] as { caption: string }).caption;

// Questions to the owner about points the map couldn't find.
const ownerQuestions = (calls: ApiCall[]) =>
  calls.filter((c) => c.method === "sendMessage" && c.args[0] === OWNER_DM).map((c) => c.args[1] as string);

// A reply in the owner's DM to the bot's question about `name`.
async function replyAbout(api: ReturnType<typeof createFakeApi>["api"], name: string, text: string, userId = OWNER_ID) {
  const prompt = await getGeoPrompt(name);
  assert.ok(prompt, `asked about ${name}`);
  const reply = createFakeCtx(api, {
    userId,
    chatId: OWNER_DM,
    message: { message_id: 500, text, reply_to_message: { message_id: prompt.messageId, from: { id: BOT_ID } } },
  });
  let passedOn = false;
  await geoPointAnswerHandler(reply.ctx, async () => {
    passedOn = true;
  });
  return { ...reply, passedOn };
}

test("a new poll gets a route map as a reply; via points are kept, places geocoded once", async () => {
  await addPlaces("Семёновка — Гош", "Цовагюх — Дилижан — Гош", "Тайное озеро");
  const { callsTo, calls } = await openPoll();

  const [photo] = callsTo("sendPhoto");
  assert.ok(photo, "route map posted");
  assert.equal(photo.args[0], GROUP_CHAT_ID);
  assert.ok(photo.args[1] instanceof InputFile);
  const extra = photo.args[2] as { caption: string; reply_parameters: { message_id: number } };
  // The pinned message is the poll.
  assert.equal(extra.reply_parameters.message_id, callsTo("pinChatMessage")[0].args[1]);
  assert.match(
    extra.caption,
    /🔴 1\. Семёновка — Гош\n🔵 2\. Цовагюх — Дилижан — Гош\n⚪ 3\. Тайное озеро — не нашёл на карте/,
  );
  assert.ok(tilesFetched > 0);
  assert.ok((await getOpenPoll(GROUP_CHAT_ID))?.routeMapMessageId);

  assert.deepEqual((await getBySeq(2))?.routeGeo, {
    sourceText: "Цовагюх — Дилижан — Гош",
    names: ["Цовагюх", "Дилижан", "Гош"],
    points: [
      { lat: 40.632, lon: 44.9583 },
      { lat: 40.7406, lon: 44.8636 },
      { lat: 40.7297, lon: 44.9958 },
    ],
  });
  // "Тайное озеро" not found → tried again without "озеро".
  assert.deepEqual(geocoded, ["Семёновка", "Гош", "Цовагюх", "Дилижан", "Гош", "Тайное озеро", "Тайное"]);

  // The owner is asked about the missing point.
  assert.deepEqual(ownerQuestions(calls).length, 1);
  assert.match(ownerQuestions(calls)[0], /Не нашёл на карте «Тайное озеро»\.\nПришлите ответом/);

  // /route_map reuses the saved points and doesn't ask the owner again;
  // /edit makes the place looked up again.
  geocoded = [];
  const fake = createFakeApi();
  await editCommand(createFakeCtx(fake.api, { userId: ADMIN_ID, match: "3 Цовагюх" }).ctx);
  const again = createFakeCtx(fake.api, { userId: ADMIN_ID });
  await routeMapCommand(again.ctx);
  assert.match(again.lastReply(), /опубликована/);
  assert.deepEqual(geocoded, ["Цовагюх"]);
  assert.match(captionOf(fake.callsTo("sendPhoto")[0]), /🟢 3\. Цовагюх$/m);
  assert.deepEqual(ownerQuestions(fake.calls), []);
});

test("the owner's coordinates fill in the point and the map is redrawn in place", async () => {
  await addPlaces("Семёновка — Тайник — Гош", "Тайник");
  const { api, calls, callsTo } = await openPoll();
  const mapMessageId = (await getOpenPoll(GROUP_CHAT_ID))!.routeMapMessageId!;
  assert.match(captionOf(callsTo("sendPhoto")[0]), /🔴 1\. Семёновка — Тайник — Гош \(без «Тайник»\)\n⚪ 2\. Тайник — не нашёл/);

  // Asked once per name, though two places mention it.
  assert.equal(ownerQuestions(calls).length, 1);
  assert.match(ownerQuestions(calls)[0], /«Тайник» — точка маршрута «Семёновка — Тайник — Гош»/);

  // Someone else's reply is passed on; nonsense gets a hint.
  assert.ok((await replyAbout(api, "Тайник", "40.75, 44.96", ADMIN_ID)).passedOn);
  assert.match((await replyAbout(api, "Тайник", "где-то у озера")).lastReply(), /Не понял, где это/);

  const answer = await replyAbout(api, "Тайник", "https://www.google.com/maps/@40.7512,44.9596,15z");
  assert.match(answer.lastReply(), /Запомнил «Тайник»: 40\.75120, 44\.95960\. Карта к опросу обновлена\./);

  const [edit] = callsTo("editMessageMedia");
  assert.equal(edit.args[0], GROUP_CHAT_ID);
  assert.equal(edit.args[1], mapMessageId);
  assert.match(captionOf(edit), /🔴 1\. Семёновка — Тайник — Гош\n🔵 2\. Тайник\n/);
  assert.deepEqual((await getBySeq(2))?.routeGeo?.points, [{ lat: 40.7512, lon: 44.9596 }]);
  assert.equal(await getGeoPrompt("Тайник"), null, "answered questions are cleared");
});

test("a short map link is followed; with no map yet, it's posted", async () => {
  await addPlaces("Тайник");
  const { api, callsTo } = await openPoll();
  assert.equal(callsTo("sendPhoto").length, 0, "nothing to draw yet");

  setShortLinkFetcher(async (url) => {
    assert.equal(url, "https://maps.app.goo.gl/AbC123");
    return Object.defineProperty(new Response(""), "url", { value: "https://www.google.com/maps/place/X/@40.7512,44.9596,15z" });
  });
  const answer = await replyAbout(api, "Тайник", "https://maps.app.goo.gl/AbC123");
  assert.match(answer.lastReply(), /Запомнил «Тайник»/);
  assert.equal(callsTo("sendPhoto").length, 1);
  assert.ok((await getOpenPoll(GROUP_CHAT_ID))?.routeMapMessageId);
});

test("links to other sites aren't fetched", async () => {
  await addPlaces("Тайник");
  const { api } = await openPoll();
  setShortLinkFetcher(async () => {
    throw new Error("must not be fetched");
  });
  const answer = await replyAbout(api, "Тайник", "https://example.com/where");
  assert.match(answer.lastReply(), /Не понял, где это/);
});

test("no map when nothing is found; the poll is posted all the same", async () => {
  await addPlaces("Тайное озеро", "Где-то там");
  const { callsTo, calls } = await openPoll();
  assert.equal(callsTo("sendPoll").length, 1);
  assert.equal(callsTo("pinChatMessage").length, 1);
  assert.equal(callsTo("sendPhoto").length, 0);
  assert.equal(tilesFetched, 0);
  assert.equal(ownerQuestions(calls).length, 2);
});

test("geocoding outage: no map, nothing saved, nobody asked", async () => {
  await addPlaces("Семёновка — Гош");
  setGeocodeFetcher(async () => new Response("busy", { status: 503 }));
  const { callsTo, calls } = await openPoll();
  assert.equal(callsTo("sendPoll").length, 1);
  assert.equal(callsTo("sendPhoto").length, 0);
  assert.equal((await getBySeq(1))?.routeGeo, undefined);
  assert.deepEqual(ownerQuestions(calls), []);
});

test("tile outage: the poll is posted without a map", async () => {
  await addPlaces("Семёновка — Гош");
  setTileFetcher(async () => {
    throw new Error("tiles down");
  });
  const { callsTo } = await openPoll();
  assert.equal(callsTo("sendPoll").length, 1);
  assert.equal(callsTo("sendPhoto").length, 0);
});

test("/route_map without an open poll", async () => {
  const { ctx, lastReply } = createFakeCtx(createFakeApi().api, { userId: ADMIN_ID });
  await routeMapCommand(ctx);
  assert.match(lastReply(), /нет открытого опроса/);
});
