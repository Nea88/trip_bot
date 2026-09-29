import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { meCommand } from "../commands/me.js";
import { yearCommand } from "../commands/year.js";
import { topCommand } from "../commands/top.js";
import { photoCommand } from "../commands/photo.js";
import { pollAnswerHandler } from "../commands/pollAnswer.js";
import { postYearSummary } from "../services/yearSummary.js";
import { addSuggestion, approveSuggestion } from "../services/suggestions.js";
import { claimOpenPoll, createPoll, resolvePendingResult } from "../services/polls.js";
import { listVotes } from "../services/pollVotes.js";
import { db } from "../firebase/firestore.js";
import {
  ADMIN_ID,
  GROUP_CHAT_ID,
  USER_ID,
  clearFirestore,
  createFakeApi,
  createFakeCtx,
  photoSizes,
  pollAnswerCtx,
} from "./harness.js";

beforeEach(clearFirestore);

const RIDER = 5;

/**
 * USER_ID suggested "дача" and "озеро". Poll [дача, озеро, Мимокрокодил]:
 * RIDER votes дача, USER_ID votes Мимокрокодил. Confirmed: went to дача on
 * 26.09.2026. The admin added a photo.
 */
async function seed(): Promise<void> {
  const dacha = await addSuggestion("дача", USER_ID, "user2", true);
  await approveSuggestion(dacha.id);
  const lake = await addSuggestion("озеро", USER_ID, "user2", true);
  await approveSuggestion(lake.id);
  const poll = await createPoll(GROUP_CHAT_ID, "tg-poll-1", 1, [dacha.id, lake.id, null]);

  await pollAnswerHandler(pollAnswerCtx("tg-poll-1", RIDER, [0]));
  await pollAnswerHandler(pollAnswerCtx("tg-poll-1", USER_ID, [2]));

  await claimOpenPoll(poll.id);
  await db.collection("polls").doc(poll.id).update({
    pendingResult: { candidateSuggestionIds: [dacha.id], voterCounts: [1] },
  });
  await resolvePendingResult(poll.id, dacha.id, "2026-09-26");
  await photoCommand(
    createFakeCtx(createFakeApi().api, {
      userId: ADMIN_ID,
      match: "1",
      replyTo: { message_id: 4, photo: photoSizes("y") },
    }).ctx,
  );
}

async function me(userId: number): Promise<string> {
  const fake = createFakeCtx(createFakeApi().api, { userId });
  await meCommand(fake.ctx);
  return fake.lastReply();
}

test("votes are stored per member, re-votes replace, retracting removes", async () => {
  const place = await addSuggestion("дача", USER_ID, "user2", true);
  await createPoll(GROUP_CHAT_ID, "tg-poll-9", 1, [place.id, null]);

  await pollAnswerHandler(pollAnswerCtx("tg-poll-9", RIDER, [0]));
  await pollAnswerHandler(pollAnswerCtx("tg-poll-9", RIDER, [1]));
  assert.deepEqual((await listVotes()).map((v) => [v.userId, v.optionIndexes]), [[RIDER, [1]]]);

  await pollAnswerHandler(pollAnswerCtx("tg-poll-9", RIDER, []));
  assert.deepEqual(await listVotes(), []);

  await pollAnswerHandler(pollAnswerCtx("someone-elses-poll", RIDER, [0]));
  assert.deepEqual(await listVotes(), [], "polls that aren't ours are ignored");
});

test("/me: went = voted for the place the group went to", async () => {
  await seed();
  assert.equal(
    await me(RIDER),
    [
      "Статистика @user5:",
      "Поездки: 1 — 26.09.2026 «дача»",
      "Идей пока нет — предложите: /suggest <куда>",
      "В архиве от вас пока ничего нет.",
    ].join("\n"),
  );
  // Voted Мимокрокодил: didn't go, even though the trip was to their own idea.
  assert.equal(
    await me(USER_ID),
    [
      "Статистика @user2:",
      "Поездок пока нет (считаются по голосу в опросе за место, куда в итоге съездили).",
      "Идеи: 2 (в пуле — 2, уже не в пуле — 0)",
      "Съездили по вашим идеям: 1 — 26.09.2026 «дача»",
      "В архиве от вас пока ничего нет.",
    ].join("\n"),
  );
  assert.match(await me(ADMIN_ID), /В архиве от вас: 1 фото/);
});

test("a trip the admin marked as not happening counts for nobody", async () => {
  const place = await addSuggestion("дача", USER_ID, "user2", true);
  await approveSuggestion(place.id);
  const poll = await createPoll(GROUP_CHAT_ID, "tg-poll-2", 1, [place.id, null]);
  await pollAnswerHandler(pollAnswerCtx("tg-poll-2", RIDER, [0]));
  await claimOpenPoll(poll.id);
  await db.collection("polls").doc(poll.id).update({
    pendingResult: { candidateSuggestionIds: [place.id], voterCounts: [1] },
  });
  await resolvePendingResult(poll.id, null); // "Никуда не ездили"

  assert.match(await me(RIDER), /Поездок пока нет/);
});

test("/year summarizes the year with top riders; the Dec 31 post goes to the group", async () => {
  await seed();
  const fake = createFakeCtx(createFakeApi().api, { userId: USER_ID });
  await yearCommand(fake.ctx);
  const text = fake.lastReply();
  assert.match(text, /^🎉 Итоги 2026 года\n\nПоездок: 1\n• 26\.09\.2026 — #1 дача/);
  assert.match(text, /Чаще всех ездили:\n1\. @user5 — 1 поездка\n/);
  assert.match(text, /Главные генераторы идей:\n1\. @user2 — 2 идеи/);
  assert.match(text, /Больше всех пополнили архив:\n1\. @user1 — 1/);

  const { api, callsTo } = createFakeApi();
  await postYearSummary(api);
  assert.equal(callsTo("sendMessage")[0].args[0], GROUP_CHAT_ID);

  const past = createFakeCtx(createFakeApi().api, { userId: USER_ID, match: "2025" });
  await yearCommand(past.ctx);
  assert.equal(past.lastReply(), "В 2025 году поездок через бота не было.");
});

test("no year-end post when there were no trips", async () => {
  const { api, calls } = createFakeApi();
  await postYearSummary(api);
  assert.equal(calls.length, 0);
});

test("/top ranks the year's riders, idea authors and archivists", async () => {
  await seed();
  const fake = createFakeCtx(createFakeApi().api, { userId: USER_ID });
  await topCommand(fake.ctx);
  assert.equal(
    fake.lastReply(),
    [
      "🏆 Рейтинг 2026 года",
      "",
      "Поездки:",
      "1. @user5 — 1 поездка",
      "",
      "Идеи (одобренные):",
      "1. @user2 — 2 идеи",
      "",
      "Пополнили архив (фото и сообщения):",
      "1. @user1 — 1",
    ].join("\n"),
  );
});
