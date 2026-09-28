import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { suggestCommand } from "../commands/suggest.js";
import { reviewCallback } from "../commands/reviewSuggestion.js";
import { deleteCallback, deleteCommand } from "../commands/deleteSuggestion.js";
import { createPollCommand } from "../commands/createPoll.js";
import { requireAdmin } from "../bot/middleware/requireAdmin.js";
import { registerForNotifications } from "../services/registrations.js";
import { getBySeq, listActiveSuggestions } from "../services/suggestions.js";
import { ADMIN_DM, ADMIN_ID, GROUP_CHAT_ID, USER_ID, clearFirestore, createFakeApi, createFakeCtx } from "./harness.js";

beforeEach(clearFirestore);

type Keyboard = { reply_markup: { inline_keyboard: { callback_data: string }[][] } };
const buttons = (call: { args: unknown[] }) =>
  (call.args[2] as Keyboard).reply_markup.inline_keyboard.flat().map((b) => b.callback_data);

async function suggest(userId: number, text: string, api = createFakeApi().api) {
  const fake = createFakeCtx(api, { userId, match: text });
  await suggestCommand(fake.ctx);
  return fake;
}

test("user suggestion goes to admin review; approve adds it once", async () => {
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  const { api, callsTo } = createFakeApi();

  const { lastReply } = await suggest(USER_ID, "на дачу", api);
  assert.match(lastReply(), /на рассмотрение/);
  assert.deepEqual(await listActiveSuggestions(), []);

  const dm = callsTo("sendMessage").find((c) => c.args[0] === ADMIN_DM);
  assert.ok(dm, "admin gets a DM");
  const [approve] = buttons(dm);

  const first = createFakeCtx(api, { userId: ADMIN_ID, chatId: ADMIN_DM, callbackData: approve });
  await reviewCallback(first.ctx as never);
  assert.match(first.edits[0], /Одобрено/);
  assert.equal((await listActiveSuggestions()).length, 1);
  assert.ok(callsTo("sendMessage").some((c) => c.args[0] === GROUP_CHAT_ID), "group is told");

  const second = createFakeCtx(api, { userId: ADMIN_ID, chatId: ADMIN_DM, callbackData: approve });
  await reviewCallback(second.ctx as never);
  assert.match(second.edits[0], /Уже обработано/);
});

test("admin suggestion is approved right away", async () => {
  const { lastReply } = await suggest(ADMIN_ID, "на озеро");
  assert.match(lastReply(), /Добавлено предложение #1/);
  assert.equal((await getBySeq(1))?.status, "active");
});

test("duplicate suggestion is refused, ignoring case and spaces", async () => {
  await suggest(ADMIN_ID, "На  Озеро");
  const { lastReply } = await suggest(USER_ID, "на озеро");
  assert.match(lastReply(), /уже есть в списке: #1/);
});

test("/delete refuses a place that is in the open poll", async () => {
  await suggest(ADMIN_ID, "на дачу");
  const { api, callsTo } = createFakeApi();
  await createPollCommand(createFakeCtx(api, { userId: ADMIN_ID }).ctx);
  assert.equal(callsTo("sendPoll").length, 1);

  const { ctx, lastReply } = createFakeCtx(api, { userId: ADMIN_ID, match: "1" });
  await deleteCommand(ctx);
  assert.match(lastReply(), /в открытом опросе/);
  assert.ok(await getBySeq(1));
});

test("/delete removes a place after confirmation", async () => {
  await suggest(ADMIN_ID, "на дачу");
  const place = await getBySeq(1);
  const { api } = createFakeApi();
  const confirm = createFakeCtx(api, { userId: ADMIN_ID, callbackData: `del:confirm:${place!.id}` });
  await deleteCallback(confirm.ctx as never);
  assert.match(confirm.edits[0], /Удалено #1/);
  assert.equal(await getBySeq(1), null);
});

test("requireAdmin lets admins through and stops others", async () => {
  const { api } = createFakeApi();
  let passed = 0;
  const next = async () => {
    passed++;
  };

  await requireAdmin(createFakeCtx(api, { userId: ADMIN_ID }).ctx, next);
  const user = createFakeCtx(api, { userId: USER_ID });
  await requireAdmin(user.ctx, next);

  assert.equal(passed, 1);
  assert.match(user.lastReply(), /только админам/);
});
