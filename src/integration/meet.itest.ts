import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { meetCommand } from "../commands/meet.js";
import { createPollCommand } from "../commands/createPoll.js";
import { addSuggestion, approveSuggestion } from "../services/suggestions.js";
import { getOpenPoll } from "../services/polls.js";
import { setWeatherFetcher } from "../services/weather.js";
import { ADMIN_ID, GROUP_CHAT_ID, clearFirestore, createFakeApi, createFakeCtx } from "./harness.js";

const SPOT = { latitude: 55.9, longitude: 37.4 };
let requestedUrls: string[] = [];

beforeEach(async () => {
  await clearFirestore();
  requestedUrls = [];
  setWeatherFetcher(async (url) => {
    requestedUrls.push(url);
    return new Response(
      JSON.stringify({
        hourly: {
          time: ["2026-10-03T09:00"],
          temperature_2m: [7.6],
          precipitation_probability: [40],
          weather_code: [61],
          wind_speed_10m: [3.2],
        },
      }),
    );
  });
  const place = await addSuggestion("дача", ADMIN_ID, "admin", true);
  await approveSuggestion(place.id);
});

async function openPollAndMeet(match: string, replyTo?: Parameters<typeof createFakeCtx>[1]["replyTo"]) {
  const fake = createFakeApi();
  await createPollCommand(createFakeCtx(fake.api, { userId: ADMIN_ID }).ctx);
  await meetCommand(createFakeCtx(fake.api, { userId: ADMIN_ID, match, replyTo }).ctx);
  const announce = fake.callsTo("sendMessage").filter((c) => c.args[0] === GROUP_CHAT_ID).at(-1)!;
  return { ...fake, text: announce.args[1] as string };
}

test("/meet in reply to a location: map pin, forecast for Saturday's start, coords saved", async () => {
  const { text, callsTo } = await openPollAndMeet("09:30 АЗС", { message_id: 5, location: SPOT });

  assert.equal(
    text,
    "🏁 Старт в субботу 03.10 в 09:30\nТочка: АЗС\nПогода к 09:00: +8°C, дождь, ветер 3 м/с, осадки 40%",
  );
  assert.deepEqual(callsTo("sendLocation").map((c) => c.args), [[GROUP_CHAT_ID, 55.9, 37.4]]);
  assert.match(requestedUrls[0], /latitude=55\.9&longitude=37\.4.*start_date=2026-10-03/);
  const poll = await getOpenPoll(GROUP_CHAT_ID);
  assert.deepEqual([poll?.meetLatitude, poll?.meetLongitude], [55.9, 37.4]);
});

test("a venue gives the place name when none is typed", async () => {
  const { text } = await openPollAndMeet("10:00", {
    message_id: 6,
    venue: { location: SPOT, title: "Лукойл", address: "Дмитровское ш., 100" },
  });
  assert.match(text, /Точка: Лукойл, Дмитровское ш\., 100/);
});

test("a bare location without text is fine too", async () => {
  const { text } = await openPollAndMeet("10:00", { message_id: 7, location: SPOT });
  assert.match(text, /Точка: точка на карте ниже/);
});

test("forecast failure doesn't block the announcement", async () => {
  setWeatherFetcher(async () => new Response("oops", { status: 500 }));
  const { text, callsTo } = await openPollAndMeet("09:30 АЗС", { message_id: 5, location: SPOT });
  assert.equal(text, "🏁 Старт в субботу 03.10 в 09:30\nТочка: АЗС");
  assert.equal(callsTo("sendLocation").length, 1);
});

test("text-only /meet has no pin and no forecast request", async () => {
  const { text, callsTo } = await openPollAndMeet("09:30 АЗС");
  assert.equal(text, "🏁 Старт в субботу 03.10 в 09:30\nТочка: АЗС");
  assert.equal(callsTo("sendLocation").length, 0);
  assert.deepEqual(requestedUrls, []);
});
