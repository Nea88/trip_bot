import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { Timestamp } from "firebase-admin/firestore";
import { createPollCommand } from "../commands/createPoll.js";
import { cancelPollCommand, closePollCallback, closePollCommand } from "../commands/closePoll.js";
import { addSuggestion, approveSuggestion, getBySeq } from "../services/suggestions.js";
import { getOpenPoll, getPollById, listClosedPolls } from "../services/polls.js";
import { setSchedule } from "../services/groupConfig.js";
import { createMissedScheduledPoll } from "../scheduler/scheduler.js";
import { db } from "../firebase/firestore.js";
import { MIMOKROKODIL_TEXT } from "../constants.js";
import { ADMIN_ID, GROUP_CHAT_ID, clearFirestore, createFakeApi, createFakeCtx } from "./harness.js";

beforeEach(clearFirestore);

async function addPlaces(count: number): Promise<void> {
  for (let i = 1; i <= count; i++) {
    const s = await addSuggestion(`место ${i}`, ADMIN_ID, "admin", true);
    await approveSuggestion(s.id);
  }
}

type Keyboard = { reply_markup: { inline_keyboard: { callback_data: string }[][] } };

async function openPoll(voteCounts: number[]) {
  const fake = createFakeApi({ voteCounts });
  await createPollCommand(createFakeCtx(fake.api, { userId: ADMIN_ID }).ctx);
  return fake;
}

test("/create_poll uses the 9 newest places plus Мимокрокодил and pins the poll", async () => {
  await addPlaces(10);
  const { api, callsTo } = await openPoll([]);

  const [poll] = callsTo("sendPoll");
  const options = poll.args[2] as string[];
  assert.equal(options.length, 10);
  assert.equal(options[0], "место 2");
  assert.equal(options.at(-1), MIMOKROKODIL_TEXT);
  assert.equal(callsTo("pinChatMessage").length, 1);

  const again = createFakeCtx(api, { userId: ADMIN_ID });
  await createPollCommand(again.ctx);
  assert.match(again.lastReply(), /уже открыт/);
});

test("/close_poll → confirm: the winner is excluded and announced exactly once", async () => {
  await addPlaces(2);
  const { api, callsTo } = await openPoll([1, 3, 0]); // место 1, место 2, Мимокрокодил

  await closePollCommand(createFakeCtx(api, { userId: ADMIN_ID }).ctx);
  assert.equal(callsTo("unpinChatMessage").length, 1);
  const confirmMessage = callsTo("sendMessage").at(-1)!;
  assert.match(confirmMessage.args[1] as string, /Подтвердите победителя/);
  const buttons = (confirmMessage.args[2] as Keyboard).reply_markup.inline_keyboard.flat();
  assert.match(buttons[0].callback_data, /:confirm:/);

  const confirm = createFakeCtx(api, { userId: ADMIN_ID, callbackData: buttons[0].callback_data });
  await closePollCallback(confirm.ctx as never);
  assert.match(confirm.edits[0], /Победитель: "место 2"/);
  assert.equal((await getBySeq(2))?.status, "excluded");

  const again = createFakeCtx(api, { userId: ADMIN_ID, callbackData: buttons[0].callback_data });
  await closePollCallback(again.ctx as never);
  assert.match(again.edits[0], /уже обработан/);
  assert.equal(callsTo("sendMessage").filter((c) => /Едем в/.test(c.args[1] as string)).length, 1);
});

test("two simultaneous confirm taps announce the winner once", async () => {
  await addPlaces(2);
  const { api, callsTo } = await openPoll([1, 3, 0]);
  await closePollCommand(createFakeCtx(api, { userId: ADMIN_ID }).ctx);
  const confirmMessage = callsTo("sendMessage").at(-1)!;
  const [button] = (confirmMessage.args[2] as Keyboard).reply_markup.inline_keyboard.flat();

  const taps = [0, 1].map(() => createFakeCtx(api, { userId: ADMIN_ID, callbackData: button.callback_data }));
  await Promise.all(taps.map((t) => closePollCallback(t.ctx as never)));

  assert.equal(callsTo("sendMessage").filter((c) => /Едем в/.test(c.args[1] as string)).length, 1);
  assert.match(taps.flatMap((t) => t.edits).join("\n"), /уже обработан/);
});

test("a tie asks to pick the winner by hand", async () => {
  await addPlaces(2);
  const { api, callsTo } = await openPoll([2, 2, 5]);
  await closePollCommand(createFakeCtx(api, { userId: ADMIN_ID }).ctx);
  assert.match(callsTo("sendMessage").at(-1)!.args[1] as string, /Ничья/);
});

test("no real votes closes the poll without a winner", async () => {
  await addPlaces(2);
  const { api } = await openPoll([0, 0, 4]);
  const { ctx, lastReply } = createFakeCtx(api, { userId: ADMIN_ID });
  await closePollCommand(ctx);
  assert.match(lastReply(), /никто не проголосовал/);
  const [poll] = await listClosedPolls();
  assert.equal(poll.winnerSuggestionId, null);
  assert.equal(poll.pendingResult, null);
});

test("two /close_poll at once process the poll only once", async () => {
  await addPlaces(2);
  const { api, callsTo } = await openPoll([1, 3, 0]);
  const a = createFakeCtx(api, { userId: ADMIN_ID });
  const b = createFakeCtx(api, { userId: ADMIN_ID });
  await Promise.all([closePollCommand(a.ctx), closePollCommand(b.ctx)]);

  assert.equal(callsTo("stopPoll").length, 1);
  assert.match([...a.replies, ...b.replies].join("\n"), /уже закрывается/);
});

test("/cancel_poll closes without counting and unpins", async () => {
  await addPlaces(2);
  const { api, callsTo } = await openPoll([1, 3, 0]);
  const { ctx, lastReply } = createFakeCtx(api, { userId: ADMIN_ID });
  await cancelPollCommand(ctx);

  assert.match(lastReply(), /без подсчёта/);
  assert.equal(await getOpenPoll(GROUP_CHAT_ID), null);
  assert.equal(callsTo("unpinChatMessage").length, 1);
  const [poll] = await listClosedPolls();
  assert.equal((await getPollById(poll.id))?.winnerSuggestionId, null);
});

// Sets a weekly schedule one hour ago, as if configured long before.
async function scheduleOneHourAgo(): Promise<void> {
  const occurrence = DateTime.now().setZone("Europe/Moscow").minus({ hours: 1 });
  await setSchedule(occurrence.weekday % 7, occurrence.toFormat("HH:mm"), "Europe/Moscow");
  await db.collection("config").doc("main").update({
    scheduleSetAt: Timestamp.fromDate(occurrence.minus({ days: 7 }).toJSDate()),
  });
}

test("a scheduled poll missed while the bot was down is created at startup", async () => {
  await addPlaces(2);
  await scheduleOneHourAgo();
  const { api, callsTo } = createFakeApi();
  await createMissedScheduledPoll(api);
  assert.equal(callsTo("sendPoll").length, 1);
  assert.ok(await getOpenPoll(GROUP_CHAT_ID));
});

test("no catch-up if a poll was already created after the scheduled time", async () => {
  await addPlaces(2);
  await scheduleOneHourAgo();
  await openPoll([]);
  await cancelPollCommand(createFakeCtx(createFakeApi().api, { userId: ADMIN_ID }).ctx);

  const { api, callsTo } = createFakeApi();
  await createMissedScheduledPoll(api);
  assert.equal(callsTo("sendPoll").length, 0);
});
