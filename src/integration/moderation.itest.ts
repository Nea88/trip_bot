import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { suggestCommand } from "../commands/suggest.js";
import { reviewCallback } from "../commands/reviewSuggestion.js";
import { photoCommand, photoReviewCallback } from "../commands/photo.js";
import { pendingCommand } from "../commands/pending.js";
import { registerForNotifications } from "../services/registrations.js";
import { addSuggestion, approveSuggestion, getBySeq } from "../services/suggestions.js";
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

type Keyboard = { reply_markup: { inline_keyboard: { callback_data: string }[][] } };
const groupMessages = (callsTo: (m: string) => { args: unknown[] }[]) =>
  callsTo("sendMessage").filter((c) => c.args[0] === GROUP_CHAT_ID);

test("without subscribed admins the author is warned their request goes unseen", async () => {
  const suggest = createFakeCtx(createFakeApi().api, { userId: USER_ID, match: "на дачу" });
  await suggestCommand(suggest.ctx);
  assert.match(suggest.lastReply(), /на рассмотрение[\s\S]*Ни один админ сейчас не подписан/);

  const place = await addSuggestion("озеро", ADMIN_ID, "admin", true);
  await approveSuggestion(place.id);
  const photo = createFakeCtx(createFakeApi().api, {
    userId: USER_ID,
    match: "2",
    replyTo: { message_id: 8, photo: photoSizes("w") },
  });
  await photoCommand(photo.ctx);
  assert.match(photo.lastReply(), /на модерацию[\s\S]*Ни один админ/);
});

test("with a subscribed admin there's no warning", async () => {
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  const suggest = createFakeCtx(createFakeApi().api, { userId: USER_ID, match: "на дачу" });
  await suggestCommand(suggest.ctx);
  assert.doesNotMatch(suggest.lastReply(), /Ни один админ/);
});

test("rejecting a suggestion tells the author in the group, mentioning them", async () => {
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  const { api, callsTo } = createFakeApi();
  await suggestCommand(createFakeCtx(api, { userId: USER_ID, match: "на <дачу>", username: "vasya" }).ctx);
  const dm = callsTo("sendMessage").find((c) => c.args[0] === ADMIN_DM)!;
  const reject = (dm.args[2] as Keyboard).reply_markup.inline_keyboard.flat()[1].callback_data;

  await reviewCallback(createFakeCtx(api, { userId: ADMIN_ID, callbackData: reject }).ctx as never);
  const [notice] = groupMessages(callsTo);
  assert.equal(
    notice.args[1],
    `<a href="tg://user?id=${USER_ID}">vasya</a>, вариант «на &lt;дачу&gt;» админ не одобрил.`,
  );
  assert.deepEqual(notice.args[2], { parse_mode: "HTML" });
});

test("rejecting photos tells the author in the group", async () => {
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  const place = await addSuggestion("озеро", ADMIN_ID, "admin", true);
  await approveSuggestion(place.id);
  const { api, callsTo } = createFakeApi();
  await photoCommand(
    createFakeCtx(api, { userId: USER_ID, match: "1", username: "petya", replyTo: { message_id: 9, photo: photoSizes("r") } }).ctx,
  );
  const dm = callsTo("sendMessage").find((c) => c.args[0] === ADMIN_DM)!;
  const reject = (dm.args[2] as Keyboard).reply_markup.inline_keyboard.flat()[1].callback_data;

  await photoReviewCallback(createFakeCtx(api, { userId: ADMIN_ID, callbackData: reject }).ctx as never);
  assert.match(groupMessages(callsTo).at(-1)!.args[1] as string, /petya<\/a>, 1 фото к #1 «озеро» админ не добавил в архив/);
});

test("/pending re-sends waiting suggestions and photos with working buttons", async () => {
  const place = await addSuggestion("озеро", ADMIN_ID, "admin", true);
  await approveSuggestion(place.id);
  await suggestCommand(createFakeCtx(createFakeApi().api, { userId: USER_ID, match: "на дачу" }).ctx);
  await photoCommand(
    createFakeCtx(createFakeApi().api, { userId: USER_ID, match: "1", replyTo: { message_id: 10, photo: photoSizes("p") } }).ctx,
  );

  const { api, callsTo } = createFakeApi();
  const pending = createFakeCtx(api, { userId: ADMIN_ID, chatId: ADMIN_DM });
  await pendingCommand(pending.ctx);
  assert.match(pending.replies[0], /предложений — 1, фото и сообщений в архив — 1/);
  assert.match(pending.replies[1], /#2: на дачу/);
  assert.match(pending.replies[2], /хочет добавить 1 фото к #1 «озеро»/);
  assert.deepEqual(callsTo("sendPhoto").map((c) => c.args), [[ADMIN_DM, "p"]]);

  // The re-sent buttons work like the original ones.
  const approveSuggestion2 = (pending.replyExtras[1] as Keyboard).reply_markup.inline_keyboard.flat()[0].callback_data;
  await reviewCallback(createFakeCtx(api, { userId: ADMIN_ID, callbackData: approveSuggestion2 }).ctx as never);
  assert.equal((await getBySeq(2))?.status, "active");

  const approvePhotos = (pending.replyExtras[2] as Keyboard).reply_markup.inline_keyboard.flat()[0].callback_data;
  await photoReviewCallback(createFakeCtx(api, { userId: ADMIN_ID, callbackData: approvePhotos }).ctx as never);

  const empty = createFakeCtx(api, { userId: ADMIN_ID, chatId: ADMIN_DM });
  await pendingCommand(empty.ctx);
  assert.equal(empty.lastReply(), "Ничего не ждёт модерации.");
});
