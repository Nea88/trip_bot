import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { InputFile } from "grammy";
import { PNG } from "pngjs";
import { createPollCommand } from "../commands/createPoll.js";
import { editCommand } from "../commands/edit.js";
import { routeMapCommand } from "../commands/routeMap.js";
import { addSuggestion, approveSuggestion, getBySeq } from "../services/suggestions.js";
import { setGeocodeFetcher } from "../services/geocoding.js";
import { setTileFetcher } from "../services/routeMap.js";
import { ADMIN_ID, GROUP_CHAT_ID, clearFirestore, createFakeApi, createFakeCtx } from "./harness.js";

const KNOWN: Record<string, { lat: string; lon: string }> = {
  Семёновка: { lat: "40.659", lon: "44.9006" },
  Цовагюх: { lat: "40.632", lon: "44.9583" },
  Гош: { lat: "40.7297", lon: "44.9958" },
};

const tile = PNG.sync.write(new PNG({ width: 256, height: 256 }));

let geocoded: string[];
let tilesFetched: number;

beforeEach(async () => {
  await clearFirestore();
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

test("a new poll gets a route map as a reply, places geocoded once", async () => {
  await addPlaces("Семёновка — Гош", "Цовагюх — Гош", "Тайное озеро");
  const { callsTo } = await openPoll();

  const [poll] = callsTo("sendPoll");
  const [photo] = callsTo("sendPhoto");
  assert.ok(photo, "route map posted");
  assert.equal(photo.args[0], GROUP_CHAT_ID);
  assert.ok(photo.args[1] instanceof InputFile);
  const extra = photo.args[2] as { caption: string; reply_parameters: { message_id: number } };
  // The pinned message is the poll.
  assert.ok(poll);
  assert.equal(extra.reply_parameters.message_id, callsTo("pinChatMessage")[0].args[1]);
  assert.match(extra.caption, /🔴 1\. Семёновка — Гош\n🔵 2\. Цовагюх — Гош\n⚪ 3\. Тайное озеро — не нашёл на карте/);
  assert.ok(tilesFetched > 0);

  assert.deepEqual((await getBySeq(1))?.routeGeo, {
    sourceText: "Семёновка — Гош",
    start: { lat: 40.659, lon: 44.9006 },
    finish: { lat: 40.7297, lon: 44.9958 },
  });
  assert.deepEqual((await getBySeq(3))?.routeGeo, { sourceText: "Тайное озеро", start: null, finish: null });
  // "Тайное озеро" not found → tried again without "озеро".
  assert.deepEqual(geocoded, ["Семёновка", "Гош", "Цовагюх", "Гош", "Тайное озеро", "Тайное"]);

  // /route_map reuses the saved points; /edit makes the place looked up again.
  geocoded = [];
  const fake = createFakeApi();
  await editCommand(createFakeCtx(fake.api, { userId: ADMIN_ID, match: "3 Цовагюх" }).ctx);
  const again = createFakeCtx(fake.api, { userId: ADMIN_ID });
  await routeMapCommand(again.ctx);
  assert.match(again.lastReply(), /опубликована/);
  assert.deepEqual(geocoded, ["Цовагюх"]);
  const caption = (fake.callsTo("sendPhoto")[0].args[2] as { caption: string }).caption;
  assert.match(caption, /🟢 3\. Цовагюх$/m);
});

test("no map when nothing is found; the poll is posted all the same", async () => {
  await addPlaces("Тайное озеро", "Где-то там");
  const { callsTo } = await openPoll();
  assert.equal(callsTo("sendPoll").length, 1);
  assert.equal(callsTo("pinChatMessage").length, 1);
  assert.equal(callsTo("sendPhoto").length, 0);
  assert.equal(tilesFetched, 0);
});

test("geocoding outage: no map, nothing saved, looked up again next time", async () => {
  await addPlaces("Семёновка — Гош");
  setGeocodeFetcher(async () => new Response("busy", { status: 503 }));
  const { callsTo } = await openPoll();
  assert.equal(callsTo("sendPoll").length, 1);
  assert.equal(callsTo("sendPhoto").length, 0);
  assert.equal((await getBySeq(1))?.routeGeo, undefined);
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
