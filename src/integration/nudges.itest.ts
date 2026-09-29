import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { closePollCallback } from "../commands/closePoll.js";
import { historyCommand } from "../commands/history.js";
import { pollAnswerHandler } from "../commands/pollAnswer.js";
import { postStartDayReminder, remindNonVoters } from "../services/weekendNudges.js";
import { addSuggestion, approveSuggestion } from "../services/suggestions.js";
import { claimOpenPoll, createPoll, setMeet } from "../services/polls.js";
import { setWeatherFetcher } from "../services/weather.js";
import { setClock } from "../utils/clock.js";
import { db } from "../firebase/firestore.js";
import {
  ADMIN_ID,
  GROUP_CHAT_ID,
  NOW,
  USER_ID,
  clearFirestore,
  createFakeApi,
  createFakeCtx,
  pollAnswerCtx,
} from "./harness.js";

const SATURDAY_MORNING = NOW.minus({ days: 1 }).set({ hour: 7, minute: 0 }); // 26.09.2026 07:00

beforeEach(clearFirestore);
afterEach(() => setClock(() => NOW));

async function place(text: string): Promise<string> {
  const s = await addSuggestion(text, USER_ID, "user2", true);
  await approveSuggestion(s.id);
  return s.id;
}

test("Saturday morning: today's start with forecast and map pin", async () => {
  const dacha = await place("дача");
  const poll = await createPoll(GROUP_CHAT_ID, "tg-1", 1, [dacha, null]);
  await setMeet(poll.id, "09:30", "АЗС", { latitude: 40.5, longitude: 44.2 });
  setClock(() => SATURDAY_MORNING);
  let requested = "";
  setWeatherFetcher(async (url) => {
    requested = url;
    return new Response(
      JSON.stringify({
        hourly: {
          time: ["2026-09-26T09:00"],
          temperature_2m: [3],
          precipitation_probability: [0],
          weather_code: [0],
          wind_speed_10m: [2],
        },
      }),
    );
  });

  const { api, callsTo } = createFakeApi();
  await postStartDayReminder(api);
  assert.equal(
    callsTo("sendMessage")[0].args[1],
    "☀️ Сегодня поездка! Старт в 09:30\nТочка: АЗС\nПогода к 09:00: +3°C, ясно, ветер 2 м/с, осадки 0%",
  );
  assert.match(requested, /start_date=2026-09-26/);
  assert.deepEqual(callsTo("sendLocation")[0].args, [GROUP_CHAT_ID, 40.5, 44.2]);
});

test("Saturday morning: silent when no start was set", async () => {
  const dacha = await place("дача");
  await createPoll(GROUP_CHAT_ID, "tg-1", 1, [dacha, null]);
  const { api, calls } = createFakeApi();
  await postStartDayReminder(api);
  assert.equal(calls.length, 0);
});

test("non-voter nudge mentions regulars who haven't voted this week", async () => {
  const dacha = await place("дача");
  const lastWeek = await createPoll(GROUP_CHAT_ID, "tg-old", 1, [dacha, null]);
  await pollAnswerHandler(pollAnswerCtx("tg-old", 5, [0]));
  await pollAnswerHandler(pollAnswerCtx("tg-old", 6, [1]));
  await claimOpenPoll(lastWeek.id);
  await createPoll(GROUP_CHAT_ID, "tg-new", 77, [dacha, null]);
  await pollAnswerHandler(pollAnswerCtx("tg-new", 6, [0]));

  const { api, callsTo } = createFakeApi();
  await remindNonVoters(api);
  const [msg] = callsTo("sendMessage");
  assert.match(msg.args[1] as string, /^🗳 <a href="tg:\/\/user\?id=5">user5<\/a> — вы ещё не проголосовали в <a href="https:\/\/t\.me\/c\/1000\/77">опросе<\/a>/);
  assert.doesNotMatch(msg.args[1] as string, /id=6/);
});

test("non-voter nudge is silent when every regular has voted", async () => {
  const dacha = await place("дача");
  await createPoll(GROUP_CHAT_ID, "tg-new", 77, [dacha, null]);
  await pollAnswerHandler(pollAnswerCtx("tg-new", 6, [0]));
  const { api, calls } = createFakeApi();
  await remindNonVoters(api);
  assert.equal(calls.length, 0);
});

test("confirming the trip asks the riders by name to save photos; /history shows turnout", async () => {
  const dacha = await place("дача <у озера>");
  const poll = await createPoll(GROUP_CHAT_ID, "tg-1", 1, [dacha, null]);
  await pollAnswerHandler(pollAnswerCtx("tg-1", 5, [0]));
  await pollAnswerHandler(pollAnswerCtx("tg-1", 6, [1])); // Мимокрокодил
  await claimOpenPoll(poll.id);
  await db.collection("polls").doc(poll.id).update({
    pendingResult: { candidateSuggestionIds: [dacha], voterCounts: [1] },
  });

  const { api, callsTo } = createFakeApi();
  await closePollCallback(createFakeCtx(api, { userId: ADMIN_ID, callbackData: `cp:${poll.id}:confirm:${dacha}` }).ctx as never);
  const announce = callsTo("sendMessage").at(-1)!;
  assert.equal(
    announce.args[1],
    "Съездили в «дача &lt;у озера&gt;»!\n<a href=\"tg://user?id=5\">user5</a>, вы ездили — ответьте на фото с поездки командой /photo 1 — они попадут в архив места (/place 1).",
  );
  assert.deepEqual(announce.args[2], { parse_mode: "HTML" });

  const history = createFakeCtx(createFakeApi().api, { userId: USER_ID });
  await historyCommand(history.ctx);
  assert.match(history.lastReply(), /#1 дача &lt;у озера&gt; · ездили 1/);
});
