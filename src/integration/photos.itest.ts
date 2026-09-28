import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { photoCommand, photoReviewCallback, unphotoCommand } from "../commands/photo.js";
import { placeCommand } from "../commands/place.js";
import { historyCommand } from "../commands/history.js";
import { deleteCallback } from "../commands/deleteSuggestion.js";
import { rememberAlbumPhotos } from "../bot/middleware/rememberAlbumPhotos.js";
import { registerForNotifications } from "../services/registrations.js";
import { addSuggestion, approveSuggestion, getById, getBySeq } from "../services/suggestions.js";
import { listApprovedForSuggestion } from "../services/placePhotos.js";
import { claimOpenPoll, createPoll, resolvePendingResult } from "../services/polls.js";
import { db } from "../firebase/firestore.js";
import {
  ADMIN_DM,
  ADMIN_ID,
  GROUP_CHAT_ID,
  USER_ID,
  clearFirestore,
  createFakeApi,
  createFakeCtx,
  photoSizes,
} from "./harness.js";

beforeEach(clearFirestore);

async function addPlace(text = "дача"): Promise<string> {
  const s = await addSuggestion(text, ADMIN_ID, "admin", true);
  await approveSuggestion(s.id);
  return s.id;
}

type Keyboard = { reply_markup: { inline_keyboard: { callback_data: string }[][] } };

test("user photo → admin approves → counted, listed in /place, removable with /unphoto", async () => {
  const placeId = await addPlace();
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  const { api, callsTo } = createFakeApi();

  const submit = createFakeCtx(api, {
    userId: USER_ID,
    match: "1",
    replyTo: { message_id: 55, photo: photoSizes("p1") },
  });
  await photoCommand(submit.ctx);
  assert.match(submit.lastReply(), /на модерацию: 1 фото/);
  assert.deepEqual(callsTo("sendPhoto").map((c) => c.args), [[ADMIN_DM, "p1"]]);

  const review = callsTo("sendMessage").find((c) => c.args[0] === ADMIN_DM)!;
  assert.match(review.args[1] as string, /https:\/\/t\.me\/c\/1000\/55/);
  const [approve] = (review.args[2] as Keyboard).reply_markup.inline_keyboard.flat();
  const approveCtx = createFakeCtx(api, { userId: ADMIN_ID, callbackData: approve.callback_data });
  await photoReviewCallback(approveCtx.ctx as never);
  assert.match(approveCtx.edits[0], /Одобрено: 1 фото/);
  assert.equal((await getById(placeId))?.photoCount, 1);

  const again = createFakeCtx(api, { userId: ADMIN_ID, callbackData: approve.callback_data });
  await photoReviewCallback(again.ctx as never);
  assert.match(again.edits[0], /уже обработано/);
  assert.equal((await getById(placeId))?.photoCount, 1);

  const place = createFakeCtx(api, { userId: USER_ID, match: "1" });
  await placeCommand(place.ctx);
  assert.match(place.lastReply(), /<a href="https:\/\/t\.me\/c\/1000\/55">1 фото<\/a>/);

  const unphoto = createFakeCtx(api, {
    userId: ADMIN_ID,
    replyTo: { message_id: 55, photo: photoSizes("p1") },
  });
  await unphotoCommand(unphoto.ctx);
  assert.match(unphoto.lastReply(), /Убрано/);
  assert.equal((await getById(placeId))?.photoCount, 0);
  assert.deepEqual(await listApprovedForSuggestion(placeId), []);
});

test("two admins approving the same photos at once count them once", async () => {
  const placeId = await addPlace();
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  const { api, callsTo } = createFakeApi();
  await photoCommand(
    createFakeCtx(api, { userId: USER_ID, match: "1", replyTo: { message_id: 60, photo: photoSizes("c") } }).ctx,
  );
  const review = callsTo("sendMessage").find((c) => c.args[0] === ADMIN_DM)!;
  const [approve] = (review.args[2] as Keyboard).reply_markup.inline_keyboard.flat();

  const taps = [0, 1].map(() => createFakeCtx(api, { userId: ADMIN_ID, callbackData: approve.callback_data }));
  await Promise.all(taps.map((t) => photoReviewCallback(t.ctx as never)));

  assert.equal((await getById(placeId))?.photoCount, 1);
  assert.match(taps.flatMap((t) => t.edits).join("\n"), /уже обработано/);
});

test("admin attaches a text message right away; the same message twice is refused", async () => {
  const placeId = await addPlace();
  const { api } = createFakeApi();
  const attach = () => {
    const fake = createFakeCtx(api, { userId: ADMIN_ID, match: "1", replyTo: { message_id: 77 } });
    return photoCommand(fake.ctx).then(() => fake);
  };

  assert.match((await attach()).lastReply(), /Добавлено 1 сообщение/);
  assert.equal((await getById(placeId))?.photoCount, 1);
  assert.match((await attach()).lastReply(), /уже есть у #1/);
});

test("a photo from a remembered album attaches the whole album", async () => {
  const placeId = await addPlace();
  const { api } = createFakeApi();
  for (const id of [30, 31, 32]) {
    const { ctx } = createFakeCtx(api, {
      userId: USER_ID,
      message: { message_id: id, media_group_id: "album-1", photo: photoSizes(`a${id}`) },
    });
    await rememberAlbumPhotos(ctx, async () => {});
  }

  const { ctx, lastReply } = createFakeCtx(api, {
    userId: ADMIN_ID,
    match: "1",
    replyTo: { message_id: 31, media_group_id: "album-1", photo: photoSizes("a31") },
  });
  await photoCommand(ctx);
  assert.match(lastReply(), /Добавлено 3 фото/);
  assert.equal((await listApprovedForSuggestion(placeId)).length, 3);
});

test("photos can't be attached to a place still awaiting approval", async () => {
  await addSuggestion("ещё не одобрено", USER_ID, "user", true);
  const { ctx, lastReply } = createFakeCtx(createFakeApi().api, {
    userId: ADMIN_ID,
    match: "1",
    replyTo: { message_id: 5, photo: photoSizes("x") },
  });
  await photoCommand(ctx);
  assert.match(lastReply(), /нельзя прикрепить/);
});

test("/delete also removes the place's archive", async () => {
  const placeId = await addPlace();
  const { api } = createFakeApi();
  await photoCommand(
    createFakeCtx(api, { userId: ADMIN_ID, match: "1", replyTo: { message_id: 9, photo: photoSizes("d") } }).ctx,
  );
  await deleteCallback(createFakeCtx(api, { userId: ADMIN_ID, callbackData: `del:confirm:${placeId}` }).ctx as never);

  const left = await db.collection("placePhotos").where("suggestionId", "==", placeId).get();
  assert.equal(left.size, 0);
  assert.equal(await getBySeq(1), null);
});

test("/history lists trips with a link to the place's photos", async () => {
  const placeId = await addPlace("дача <у озера>");
  const { api } = createFakeApi();
  await photoCommand(
    createFakeCtx(api, { userId: ADMIN_ID, match: "1", replyTo: { message_id: 42, photo: photoSizes("h") } }).ctx,
  );
  const poll = await createPoll(GROUP_CHAT_ID, "tg", 1, [placeId, null]);
  await claimOpenPoll(poll.id);
  await db.collection("polls").doc(poll.id).update({
    pendingResult: { candidateSuggestionIds: [placeId], voterCounts: [3] },
  });
  await resolvePendingResult(poll.id, placeId);

  const { ctx, lastReply } = createFakeCtx(api, { userId: USER_ID });
  await historyCommand(ctx);
  const text = lastReply();
  assert.match(text, /Поездки \(1\)/);
  assert.match(text, /#1 дача &lt;у озера&gt; 📷 1 · <a href="https:\/\/t\.me\/c\/1000\/42">фото<\/a>/);
  assert.match(text, /@admin — 1 идея, 1 победа/);
});
