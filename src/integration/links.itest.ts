import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  addLinkCommand,
  deleteLinkCommand,
  linkReviewCallback,
  linksCommand,
  rejectReasonHandler,
} from "../commands/links.js";
import { pendingCommand } from "../commands/pending.js";
import { setWelcomeTextCommand, welcomeNewMembers } from "../commands/welcome.js";
import { registerForNotifications } from "../services/registrations.js";
import { getLinkBySeq } from "../services/links.js";
import {
  ADMIN_DM,
  ADMIN_ID,
  BOT_ID,
  GROUP_CHAT_ID,
  USER_ID,
  clearFirestore,
  createFakeApi,
  createFakeCtx,
} from "./harness.js";

beforeEach(async () => {
  await clearFirestore();
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
});

type Keyboard = { reply_markup: { inline_keyboard: { callback_data: string }[][] } };
const URL_A = "https://example.com/fuel-map";

async function suggestLink(api = createFakeApi().api, match = `${URL_A} Карта заправок`, userId = USER_ID) {
  const fake = createFakeCtx(api, { userId, match, username: "vasya" });
  await addLinkCommand(fake.ctx);
  return fake;
}

// The review DM's buttons: [approve, reject].
function reviewButtons(callsTo: (m: string) => { args: unknown[] }[]): string[] {
  const dm = callsTo("sendMessage").find((c) => c.args[0] === ADMIN_DM)!;
  return (dm.args[2] as Keyboard).reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
}

test("member's link: to admins → approved → published and listed", async () => {
  const { api, callsTo } = createFakeApi();
  const submit = await suggestLink(api);
  assert.equal(submit.lastReply(), "Ссылка отправлена на проверку админу.");
  assert.match(callsTo("sendMessage")[0].args[1] as string, /@vasya предлагает полезную ссылку #1:\nКарта заправок\nhttps:\/\/example\.com\/fuel-map/);

  const [approve] = reviewButtons(callsTo);
  const tap = createFakeCtx(api, { userId: ADMIN_ID, chatId: ADMIN_DM, callbackData: approve });
  await linkReviewCallback(tap.ctx as never);
  assert.equal(tap.edits[0], "Одобрено: #1 Карта заправок");
  const announce = callsTo("sendMessage").find((c) => c.args[0] === GROUP_CHAT_ID)!;
  assert.match(announce.args[1] as string, /Новая полезная ссылка: <a href="https:\/\/example\.com\/fuel-map">Карта заправок<\/a>/);

  const list = createFakeCtx(api, { userId: USER_ID });
  await linksCommand(list.ctx);
  assert.match(list.lastReply(), /#1 <a href="https:\/\/example\.com\/fuel-map">Карта заправок<\/a>/);

  const again = createFakeCtx(api, { userId: ADMIN_ID, callbackData: approve });
  await linkReviewCallback(again.ctx as never);
  assert.equal(again.edits[0], "Эта ссылка уже обработана.");
});

test("reject: admin is asked why; the reason goes to the author's DM", async () => {
  const { api, callsTo } = createFakeApi();
  await suggestLink(api);
  const [, reject] = reviewButtons(callsTo);

  const tap = createFakeCtx(api, { userId: ADMIN_ID, chatId: ADMIN_DM, callbackData: reject });
  await linkReviewCallback(tap.ctx as never);
  assert.match(tap.lastReply(), /Почему отклоняете «Карта заправок»\?/);
  assert.deepEqual((tap.replyExtras[0] as { reply_markup: { force_reply: boolean } }).reply_markup.force_reply, true);
  const promptId = 900 + tap.replies.length;

  const answer = createFakeCtx(api, {
    userId: ADMIN_ID,
    chatId: ADMIN_DM,
    message: {
      message_id: 50,
      text: "  уже есть похожая в закрепе ",
      reply_to_message: { message_id: promptId, from: { id: BOT_ID, is_bot: true } },
    },
  });
  let passedOn = false;
  await rejectReasonHandler(answer.ctx, async () => {
    passedOn = true;
  });
  assert.equal(passedOn, false);
  assert.equal(answer.lastReply(), "Отклонено. Автору сообщили в личные сообщения.");
  const dm = callsTo("sendMessage").find((c) => c.args[0] === USER_ID)!;
  assert.equal(dm.args[1], "Ссылку «Карта заправок» не добавили в полезные. Причина: уже есть похожая в закрепе");
  assert.equal((await getLinkBySeq(1))?.status, "rejected");

  // Suggesting the same link again explains it was rejected.
  const retry = await suggestLink(api, "https://www.example.com/fuel-map/ Другая карта");
  assert.equal(retry.lastReply(), "Эту ссылку уже отклоняли: уже есть похожая в закрепе");
});

test("reject: if the bot can't DM the author, it tells them in the group; '-' means no reason", async () => {
  const { api, callsTo } = createFakeApi({ unreachableChats: [USER_ID] });
  await suggestLink(api);
  const [, reject] = reviewButtons(callsTo);
  const tap = createFakeCtx(api, { userId: ADMIN_ID, chatId: ADMIN_DM, callbackData: reject });
  await linkReviewCallback(tap.ctx as never);

  const answer = createFakeCtx(api, {
    userId: ADMIN_ID,
    chatId: ADMIN_DM,
    message: { message_id: 51, text: "-", reply_to_message: { message_id: 901, from: { id: BOT_ID, is_bot: true } } },
  });
  await rejectReasonHandler(answer.ctx, async () => {});
  assert.match(answer.lastReply(), /в группе/);
  const notice = callsTo("sendMessage").filter((c) => c.args[0] === GROUP_CHAT_ID).at(-1)!;
  assert.equal(notice.args[1], `<a href="tg://user?id=${USER_ID}">vasya</a>, ссылку «Карта заправок» не добавили в полезные.`);
});

test("replies that aren't answers to a reject prompt pass through", async () => {
  const fake = createFakeCtx(createFakeApi().api, {
    userId: USER_ID,
    message: { message_id: 52, text: "просто ответ", reply_to_message: { message_id: 7, from: { id: BOT_ID, is_bot: true } } },
  });
  let passedOn = false;
  await rejectReasonHandler(fake.ctx, async () => {
    passedOn = true;
  });
  assert.equal(passedOn, true);
});

test("admin's link is added at once; duplicates and bad input are refused; /dellink removes", async () => {
  const { api } = createFakeApi();
  const admin = await suggestLink(api, `${URL_A} Карта заправок`, ADMIN_ID);
  assert.match(admin.lastReply(), /Добавлено в полезные ссылки/);
  assert.match((await suggestLink(api, "http://EXAMPLE.com/fuel-map#x Дубль")).lastReply(), /уже есть в полезных: #1/);
  assert.match((await suggestLink(api, "example.com Карта")).lastReply(), /Не похоже на ссылку/);

  const del = createFakeCtx(api, { userId: ADMIN_ID, match: "1" });
  await deleteLinkCommand(del.ctx);
  assert.equal(del.lastReply(), "Удалено: #1 Карта заправок");
  const list = createFakeCtx(api, { userId: USER_ID });
  await linksCommand(list.ctx);
  assert.match(list.replies[0], /пока нет/);
});

test("/pending includes links waiting for review", async () => {
  await suggestLink();
  const pending = createFakeCtx(createFakeApi().api, { userId: ADMIN_ID, chatId: ADMIN_DM });
  await pendingCommand(pending.ctx);
  assert.match(pending.replies[0], /ссылок — 1/);
  assert.match(pending.replies.at(-1)!, /предлагает полезную ссылку #1/);
});

test("new members are welcomed with what the bot does and where the links are", async () => {
  const { api } = createFakeApi();
  const join = createFakeCtx(api, {
    userId: 7,
    message: {
      message_id: 60,
      new_chat_members: [
        { id: 7, is_bot: false, first_name: "Аня" },
        { id: 99, is_bot: true, first_name: "SomeBot" },
      ],
    },
  });
  await welcomeNewMembers(join.ctx);
  assert.match(join.lastReply(), /^👋 Добро пожаловать, <a href="tg:\/\/user\?id=7">Аня<\/a>!\n\n/);
  assert.match(join.lastReply(), /\/links[\s\S]*\/addlink &lt;ссылка&gt; &lt;описание&gt;/);
  assert.doesNotMatch(join.lastReply(), /SomeBot/);

  await setWelcomeTextCommand(createFakeCtx(api, { userId: ADMIN_ID, match: "Привет! Правила — в закрепе." }).ctx);
  const next = createFakeCtx(api, {
    userId: 8,
    message: { message_id: 61, new_chat_members: [{ id: 8, is_bot: false, first_name: "Олег" }] },
  });
  await welcomeNewMembers(next.ctx);
  assert.match(next.lastReply(), /Олег<\/a>!\n\nПривет! Правила — в закрепе\.$/);
});
