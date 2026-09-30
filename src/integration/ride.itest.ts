import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { cancelRideCommand } from "../commands/cancelRide.js";
import { closePollCallback } from "../commands/closePoll.js";
import { routeRatingCallback } from "../commands/routeRating.js";
import { placeCommand } from "../commands/place.js";
import { excludedCommand } from "../commands/excluded.js";
import { pollAnswerHandler } from "../commands/pollAnswer.js";
import { postStartDayReminder, warnAboutWeather } from "../services/weekendNudges.js";
import { addSuggestion, approveSuggestion, getBySeq } from "../services/suggestions.js";
import { claimOpenPoll, createPoll, getOpenPoll, getPollById, setMeet } from "../services/polls.js";
import { registerForNotifications } from "../services/registrations.js";
import { setWeatherFetcher } from "../services/weather.js";
import { setClock } from "../utils/clock.js";
import { db } from "../firebase/firestore.js";
import {
  ADMIN_DM,
  ADMIN_ID,
  GROUP_CHAT_ID,
  NOW,
  USER_ID,
  clearFirestore,
  createFakeApi,
  createFakeCtx,
  pollAnswerCtx,
} from "./harness.js";

const FRIDAY_EVENING = NOW.minus({ days: 2 }).set({ hour: 20, minute: 30 }); // 25.09.2026 20:30

beforeEach(clearFirestore);
afterEach(() => {
  setClock(() => NOW);
  setWeatherFetcher(async () => {
    throw new Error("no network in tests");
  });
});

async function place(text: string): Promise<string> {
  const s = await addSuggestion(text, USER_ID, "user2", true);
  await approveSuggestion(s.id);
  return s.id;
}

function forecast(hour: { temperature: number; code: number; wind: number }) {
  return async () =>
    new Response(
      JSON.stringify({
        hourly: {
          time: ["2026-09-26T09:00"],
          temperature_2m: [hour.temperature],
          precipitation_probability: [90],
          weather_code: [hour.code],
          wind_speed_10m: [hour.wind],
        },
      }),
    );
}

test("/cancel_ride closes the poll without a winner and tells everyone who voted for a place", async () => {
  const dacha = await place("дача");
  const poll = await createPoll(GROUP_CHAT_ID, "tg-1", 77, [dacha, null]);
  await setMeet(poll.id, "09:00", "АЗС", null);
  await pollAnswerHandler(pollAnswerCtx("tg-1", 5, [0]));
  await pollAnswerHandler(pollAnswerCtx("tg-1", 6, [1])); // Мимокрокодил
  setClock(() => FRIDAY_EVENING);

  const { api, callsTo } = createFakeApi();
  const admin = createFakeCtx(api, { userId: ADMIN_ID, chatId: ADMIN_DM, match: "гроза <сильная>" });
  await cancelRideCommand(admin.ctx);

  assert.equal(callsTo("stopPoll").length, 1);
  const [announce] = callsTo("sendMessage");
  assert.equal(announce.args[0], GROUP_CHAT_ID);
  assert.equal(
    announce.args[1],
    "🚫 Поездка в субботу 26.09 отменяется. Причина: гроза &lt;сильная&gt;\n" +
      '<a href="tg://user?id=5">user5</a> — вы собирались ехать, в этот раз без поездки.\n' +
      "Места из опроса остаются в пуле.",
  );
  assert.equal(admin.lastReply(), "Отмена опубликована в группе.");
  assert.equal(await getOpenPoll(GROUP_CHAT_ID), null);
  assert.equal((await getPollById(poll.id))?.winnerSuggestionId, null);
  assert.equal((await getBySeq(1))?.status, "active");

  // Nothing left for Saturday morning to announce.
  const saturday = createFakeApi();
  await postStartDayReminder(saturday.api);
  assert.equal(saturday.calls.length, 0);

  const again = createFakeCtx(createFakeApi().api, { userId: ADMIN_ID });
  await cancelRideCommand(again.ctx);
  assert.match(again.lastReply(), /нет открытого опроса/);
});

test("/cancel_ride without a reason or voters", async () => {
  await createPoll(GROUP_CHAT_ID, "tg-1", 77, [await place("дача"), null]);
  setClock(() => FRIDAY_EVENING);
  const { api, callsTo } = createFakeApi();
  const admin = createFakeCtx(api, { userId: ADMIN_ID });
  await cancelRideCommand(admin.ctx);
  assert.equal(callsTo("sendMessage")[0].args[1], "🚫 Поездка в субботу 26.09 отменяется.\nМеста из опроса остаются в пуле.");
  assert.equal(admin.replies.length, 0, "announced in the group itself — no extra reply");
});

test("confirming a trip asks for сервантопроходимость; ratings average per place", async () => {
  const dacha = await place("дача");
  const poll = await createPoll(GROUP_CHAT_ID, "tg-1", 1, [dacha, null]);
  await claimOpenPoll(poll.id);
  await db.collection("polls").doc(poll.id).update({
    pendingResult: { candidateSuggestionIds: [dacha], voterCounts: [1] },
  });

  const { api, callsTo } = createFakeApi();
  await closePollCallback(createFakeCtx(api, { userId: ADMIN_ID, callbackData: `cp:${poll.id}:confirm:${dacha}` }).ctx as never);
  const prompt = callsTo("sendMessage").at(-1)!;
  assert.match(prompt.args[1] as string, /^🚙 Ну что, сервант справился\? Оцените сервантопроходимость маршрута «дача» \(Honda CR-V в вакууме\):\n1 — «я же кроссовер»/);
  assert.match(prompt.args[1] as string, /Оценок пока нет\.$/);
  const buttons = (prompt.args[2] as { reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] } })
    .reply_markup.inline_keyboard.flat();
  assert.deepEqual(buttons.map((b) => b.text), ["1", "2", "3", "4", "5"]);

  const tap = async (userId: number, score: number) => {
    const fake = createFakeCtx(api, { userId, callbackData: buttons[score - 1].callback_data });
    await routeRatingCallback(fake.ctx as never);
    return fake;
  };
  const first = await tap(USER_ID, 4);
  assert.deepEqual(first.callbackAnswers, ["Ваша оценка: 4 — справился и уже всем рассказывает, что он внедорожник"]);
  assert.match(first.edits[0], /Средняя: 4 из 5 \(1 оценка\)$/);

  await tap(USER_ID, 2); // changes the same member's rating
  const third = await tap(ADMIN_ID, 5);
  assert.match(third.edits[0], /Средняя: 3\.5 из 5 \(2 оценки\)$/);

  const card = createFakeCtx(createFakeApi().api, { userId: USER_ID, match: "1" });
  await placeCommand(card.ctx);
  assert.match(card.lastReply(), /🚙 Сервантопроходимость маршрута: 3\.5 из 5 \(2 оценки\)/);

  const excluded = createFakeCtx(createFakeApi().api, { userId: ADMIN_ID });
  await excludedCommand(excluded.ctx);
  assert.match(excluded.lastReply(), /#1: дача 🚙3\.5 \(исключено/);
});

test("a rating for a trip that was never confirmed is refused", async () => {
  const poll = await createPoll(GROUP_CHAT_ID, "tg-1", 1, [await place("дача"), null]);
  const fake = createFakeCtx(createFakeApi().api, { userId: USER_ID, callbackData: `srv:${poll.id}:3` });
  await routeRatingCallback(fake.ctx as never);
  assert.deepEqual(fake.callbackAnswers, ["Эта оценка больше не принимается."]);
  assert.equal(fake.edits.length, 0);
});

async function pollWithMeet(coords: { latitude: number; longitude: number } | null) {
  const poll = await createPoll(GROUP_CHAT_ID, "tg-1", 1, [await place("дача"), null]);
  await setMeet(poll.id, "09:30", "АЗС", coords);
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  setClock(() => FRIDAY_EVENING);
}

test("Friday evening: a severe forecast for the start warns admins", async () => {
  await pollWithMeet({ latitude: 40.5, longitude: 44.2 });
  setWeatherFetcher(forecast({ temperature: 12, code: 95, wind: 16 }));

  const { api, callsTo } = createFakeApi();
  await warnAboutWeather(api);
  const [warning] = callsTo("sendMessage");
  assert.equal(warning.args[0], ADMIN_DM);
  assert.equal(
    warning.args[1],
    "⚠️ Плохой прогноз на завтрашний старт в 09:30: гроза, ветер 16 м/с.\n" +
      "Погода к 09:00: +12°C, гроза, ветер 16 м/с, осадки 90%\n" +
      "Если решите отменить поездку — /cancel_ride <причина>, группа получит объявление.",
  );
});

test("Friday evening: ordinary weather, or a start without a location, stays silent", async () => {
  await pollWithMeet({ latitude: 40.5, longitude: 44.2 });
  setWeatherFetcher(forecast({ temperature: 4, code: 61, wind: 6 }));
  const mild = createFakeApi();
  await warnAboutWeather(mild.api);
  assert.equal(mild.calls.length, 0);

  await clearFirestore();
  await pollWithMeet(null);
  let fetched = false;
  setWeatherFetcher(async () => {
    fetched = true;
    return new Response("{}");
  });
  const noCoords = createFakeApi();
  await warnAboutWeather(noCoords.api);
  assert.equal(noCoords.calls.length, 0);
  assert.equal(fetched, false);
});
