import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { handleWeb, formTokenForTests, type WebRequest } from "../web/handler.js";
import { createPollCommand } from "../commands/createPoll.js";
import { addSuggestion, approveSuggestion, getBySeq } from "../services/suggestions.js";
import { registerForNotifications } from "../services/registrations.js";
import { getGeoPrompt } from "../services/geoPoints.js";
import { setGeocodeFetcher } from "../services/geocoding.js";
import { setTileFetcher } from "../services/routeMap.js";
import { db } from "../firebase/firestore.js";
import { ADMIN_ID, OWNER_DM, OWNER_ID, clearFirestore, createFakeApi, createFakeCtx } from "./harness.js";

const KNOWN: Record<string, { lat: string; lon: string }> = {
  Семёновка: { lat: "40.659", lon: "44.9006" },
  Гош: { lat: "40.7297", lon: "44.9958" },
};
const tile = PNG.sync.write(new PNG({ width: 256, height: 256 }));
let geocoderDown = false;

beforeEach(async () => {
  await clearFirestore();
  await registerForNotifications(OWNER_ID, OWNER_DM, "owner");
  geocoderDown = false;
  setGeocodeFetcher(async (url) => {
    if (geocoderDown) return new Response("busy", { status: 503 });
    const q = new URL(url).searchParams.get("q")!;
    return Response.json(KNOWN[q] ? [KNOWN[q]] : []);
  });
  setTileFetcher(async () => new Response(tile));
});

async function addPlaces(...texts: string[]): Promise<void> {
  for (const text of texts) {
    const s = await addSuggestion(text, ADMIN_ID, "admin", true);
    await approveSuggestion(s.id);
  }
}

const get = (url: string): WebRequest => ({ method: "GET", url, headers: {}, body: "" });
const post = (url: string, form: Record<string, string>, headers: WebRequest["headers"] = {}): WebRequest => ({
  method: "POST",
  url,
  headers,
  body: new URLSearchParams({ token: formTokenForTests, ...form }).toString(),
});
const messageOf = (location: string) => new URL(location, "http://panel/").searchParams.get("msg") ?? "";

test("panel lists places with their points", async () => {
  await addPlaces("Семёновка — Тайник — Гош", "Арагац");
  const fake = createFakeApi();
  await createPollCommand(createFakeCtx(fake.api, { userId: ADMIN_ID }).ctx);

  const page = await handleWeb(fake.api, get("/"));
  assert.equal(page.status, 200);
  const html = String(page.body);
  assert.match(html, /#1 Семёновка — Тайник — Гош/);
  assert.match(html, /Тайник<\/td>\s*<td class="coords"><span class="missing">не найдено/);
  assert.match(html, /Семёновка<\/td>\s*<td class="coords">40\.65900, 44\.90060<span class="source">найдено по названию/);
});

test("saving a point: every place with the name gets it, the owner's question goes, the map is redrawn", async () => {
  await addPlaces("Семёновка — Тайник — Гош", "Тайник");
  const fake = createFakeApi();
  await createPollCommand(createFakeCtx(fake.api, { userId: ADMIN_ID }).ctx);
  assert.ok(await getGeoPrompt("Тайник"), "the owner was asked");

  const res = await handleWeb(
    fake.api,
    post("/points", { name: "Тайник", value: "https://www.google.com/maps/@40.7512,44.9596,15z", action: "save" }, {
      "x-remote-user-display-name": "Dmitriy",
    }),
  );
  assert.equal(res.status, 303);
  assert.match(messageOf(res.headers.Location), /«Тайник» → 40\.75120, 44\.95960 \(2 места\)\. Карта к открытому опросу перерисована\./);

  assert.deepEqual((await getBySeq(1))?.routeGeo?.points[1], { lat: 40.7512, lon: 44.9596 });
  assert.deepEqual((await getBySeq(2))?.routeGeo?.points, [{ lat: 40.7512, lon: 44.9596 }]);
  assert.equal(await getGeoPrompt("Тайник"), null);
  assert.equal(fake.callsTo("editMessageMedia").length, 1);
  const saved = (await db.collection("geoPoints").get()).docs.map((d) => d.data());
  assert.equal(saved.length, 1);
  assert.equal(saved[0].setVia, "homeassistant");
  assert.equal(saved[0].setByName, "Dmitriy");

  // Shown as set by hand, with a reset button.
  const html = String((await handleWeb(fake.api, get("/"))).body);
  assert.match(html, /40\.75120, 44\.95960<span class="source">указано вручную/);
  assert.match(html, /value="reset"/);
});

test("a wrong value changes nothing", async () => {
  await addPlaces("Семёновка — Гош");
  const fake = createFakeApi();
  await createPollCommand(createFakeCtx(fake.api, { userId: ADMIN_ID }).ctx);
  const before = (await getBySeq(1))?.routeGeo;
  const res = await handleWeb(fake.api, post("/points", { name: "Гош", value: "где-то тут", action: "save" }));
  assert.match(messageOf(res.headers.Location), /не понял координаты «где-то тут»/);
  assert.deepEqual((await getBySeq(1))?.routeGeo, before);
});

test("reset forgets the hand-given point and looks the name up again", async () => {
  await addPlaces("Семёновка — Гош");
  const fake = createFakeApi();
  await createPollCommand(createFakeCtx(fake.api, { userId: ADMIN_ID }).ctx);
  await handleWeb(fake.api, post("/points", { name: "Гош", value: "40.1, 44.1", action: "save" }));
  assert.deepEqual((await getBySeq(1))?.routeGeo?.points[1], { lat: 40.1, lon: 44.1 });

  geocoderDown = true;
  const down = await handleWeb(fake.api, post("/points", { name: "Гош", action: "reset" }));
  assert.match(messageOf(down.headers.Location), /недоступен, точка не изменилась/);
  assert.deepEqual((await getBySeq(1))?.routeGeo?.points[1], { lat: 40.1, lon: 44.1 });

  geocoderDown = false;
  const res = await handleWeb(fake.api, post("/points", { name: "Гош", action: "reset" }));
  assert.match(messageOf(res.headers.Location), /ручная точка забыта, по названию найдено 40\.72970, 44\.99580/);
  assert.deepEqual((await getBySeq(1))?.routeGeo?.points[1], { lat: 40.7297, lon: 44.9958 });
  assert.equal((await db.collection("geoPoints").get()).size, 0);
});

test("places not in a poll yet can be looked up from the panel", async () => {
  await addPlaces("Семёновка — Гош");
  const { api } = createFakeApi();
  const page = String((await handleWeb(api, get("/"))).body);
  assert.match(page, /Точки ещё не искали/);
  const place = await getBySeq(1);
  const res = await handleWeb(api, post("/locate", { id: place!.id }));
  assert.match(messageOf(res.headers.Location), /#1: найдено точек — 2 из 2\./);
  assert.equal((await getBySeq(1))?.routeGeo?.points.length, 2);
});

test("preview draws one place's route", async () => {
  await addPlaces("Семёновка — Гош", "Тайник");
  const { api } = createFakeApi();
  const ok = await handleWeb(api, get(`/preview/${(await getBySeq(1))!.id}.png`));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers["Content-Type"], "image/png");
  assert.ok(Buffer.isBuffer(ok.body));
  assert.equal((await handleWeb(api, get(`/preview/${(await getBySeq(2))!.id}.png`))).status, 404);
  assert.equal((await handleWeb(api, get("/preview/nope.png"))).status, 404);
});

test("forms without the page's token are refused; unknown paths 404", async () => {
  await addPlaces("Семёновка — Гош");
  const { api } = createFakeApi();
  const res = await handleWeb(api, {
    method: "POST",
    url: "/points",
    headers: {},
    body: new URLSearchParams({ name: "Гош", value: "40.1, 44.1", action: "save" }).toString(),
  });
  assert.match(messageOf(res.headers.Location), /Страница устарела/);
  assert.equal((await db.collection("geoPoints").get()).size, 0);
  assert.equal((await handleWeb(api, get("/admin"))).status, 404);
});

test("renaming a place: points found again, the poll's map redrawn, the poll itself can't change", async () => {
  await addPlaces("Семёновка Гош", "Арагац");
  const fake = createFakeApi();
  await createPollCommand(createFakeCtx(fake.api, { userId: ADMIN_ID }).ctx);
  const place = (await getBySeq(1))!;
  assert.deepEqual(place.routeGeo?.names, ["Семёновка Гош"]);

  const res = await handleWeb(fake.api, post("/rename", { id: place.id, text: "  Семёновка-Гош " }));
  assert.equal(
    messageOf(res.headers.Location),
    "#1: «Семёновка Гош» → «Семёновка-Гош». Точек найдено: 2 из 2. Карта к открытому опросу перерисована. " +
      "В уже отправленном опросе вариант останется со старым названием — Telegram не даёт менять опросы.",
  );
  const renamed = (await getBySeq(1))!;
  assert.equal(renamed.text, "Семёновка-Гош");
  assert.deepEqual(renamed.routeGeo?.names, ["Семёновка", "Гош"]);
  // Nothing was found before, so there was no map yet: it's posted now.
  assert.equal(fake.callsTo("editMessageMedia").length, 0);
  assert.match((fake.callsTo("sendPhoto").at(-1)!.args[2] as { caption: string }).caption, /🔴 1\. Семёновка-Гош/);
});

test("renaming refuses duplicates and bad text; excluded places can be renamed too", async () => {
  await addPlaces("Арагац", "Гош");
  const { api } = createFakeApi();
  const first = (await getBySeq(1))!;
  const dup = await handleWeb(api, post("/rename", { id: first.id, text: "гош" }));
  assert.match(messageOf(dup.headers.Location), /такое уже есть — #2 «Гош»/);
  const bad = await handleWeb(api, post("/rename", { id: first.id, text: "ab" }));
  assert.match(messageOf(bad.headers.Location), /Название не сохранено: Слишком коротко/);
  assert.equal((await getBySeq(1))?.text, "Арагац");

  await db.collection("suggestions").doc(first.id).update({ status: "excluded" });
  const ok = await handleWeb(api, post("/rename", { id: first.id, text: "Арагац северный" }));
  assert.match(messageOf(ok.headers.Location), /^#1: «Арагац» → «Арагац северный»\./);
  assert.equal((await getBySeq(1))?.text, "Арагац северный");
});
