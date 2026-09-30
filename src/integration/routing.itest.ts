import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Update, UserFromGetMe } from "grammy/types";
import { createBot } from "../bot/bot.js";
import { COMMANDS, type CommandSpec } from "../bot/commandSpecs.js";
import { addSuggestion } from "../services/suggestions.js";
import { createPoll } from "../services/polls.js";
import { listVotes } from "../services/pollVotes.js";
import { ADMIN_DM, ADMIN_ID, GROUP_CHAT_ID, USER_ID, clearFirestore } from "./harness.js";
import { assertTelegramHtml } from "../utils/html.js";

/**
 * Updates go through the real bot (createBot): command registration, the
 * admin/group/DM guards and the other handlers — only the Telegram API is
 * faked. The other integration tests call handlers directly and would miss a
 * command wired without its guard.
 */

const USER_DM = 202;
let updateId = 1;

function makeBot() {
  const bot = createBot();
  bot.botInfo = {
    id: 42,
    is_bot: true,
    first_name: "Test",
    username: "test_bot",
  } as UserFromGetMe;
  const sent: { method: string; payload: Record<string, unknown> }[] = [];
  let messageId = 5000;
  bot.api.config.use(async (_prev, method, payload) => {
    const p = payload as Record<string, unknown>;
    if (p.parse_mode === "HTML") assertTelegramHtml(String(p.text));
    sent.push({ method, payload: p });
    const result =
      method === "getChatMember"
        ? { status: p.user_id === ADMIN_ID ? "administrator" : "member", user: { id: p.user_id } }
        : { message_id: messageId++, date: 0, chat: { id: p.chat_id } };
    return { ok: true, result } as never;
  });
  const texts = () => sent.filter((s) => s.method === "sendMessage").map((s) => String(s.payload.text));
  return { bot, sent, texts };
}

function chat(chatId: number) {
  return chatId < 0 ? { id: chatId, type: "supergroup", title: "Поездки" } : { id: chatId, type: "private", first_name: "Тест" };
}

function commandUpdate(text: string, fromId: number, chatId: number): Update {
  return {
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: 0,
      chat: chat(chatId),
      from: { id: fromId, is_bot: false, first_name: "Тест", username: `user${fromId}` },
      text,
      entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }],
    },
  } as Update;
}

beforeEach(clearFirestore);

const specs: readonly CommandSpec[] = COMMANDS;

test("every admin command refuses a regular member", async () => {
  for (const spec of specs.filter((c) => c.audience === "admin")) {
    const { bot, texts } = makeBot();
    const chatId = spec.where === "dm" ? USER_DM : GROUP_CHAT_ID;
    await bot.handleUpdate(commandUpdate(`/${spec.command}`, USER_ID, chatId));
    assert.deepEqual(texts(), ["Эта команда доступна только админам группы."], `/${spec.command}`);
  }
});

test("group-only commands refuse DMs; DM-only commands refuse the group", async () => {
  for (const spec of specs.filter((c) => c.where !== "any")) {
    const { bot, texts } = makeBot();
    const fromId = spec.audience === "admin" ? ADMIN_ID : USER_ID;
    const wrongChat = spec.where === "group" ? (fromId === ADMIN_ID ? ADMIN_DM : USER_DM) : GROUP_CHAT_ID;
    await bot.handleUpdate(commandUpdate(`/${spec.command}`, fromId, wrongChat));
    const expected =
      spec.where === "group" ? "Эта команда работает только в группе поездок." : "Напишите мне это в личные сообщения.";
    assert.deepEqual(texts(), [expected], `/${spec.command}`);
  }
});

test("an admin gets through both guards to the handler", async () => {
  const { bot, texts } = makeBot();
  await bot.handleUpdate(commandUpdate("/close_poll", ADMIN_ID, GROUP_CHAT_ID));
  assert.deepEqual(texts(), ["Сейчас нет открытого опроса."]);
});

test("commands for everyone work where they're allowed", async () => {
  const { bot, texts } = makeBot();
  await bot.handleUpdate(commandUpdate("/list", USER_ID, GROUP_CHAT_ID));
  await bot.handleUpdate(commandUpdate("/help", USER_ID, USER_DM));
  assert.equal(texts()[0], "Активных предложений пока нет.");
  assert.match(texts()[1], /^Команды:/);
});

test("buttons are admin-only", async () => {
  const place = await addSuggestion("дача", USER_ID, "user2", true);
  for (const data of [`rev:${place.id}:approve`, `del:confirm:${place.id}`, "cp:x:cancel", "ph:x:approve"]) {
    const { bot, texts } = makeBot();
    await bot.handleUpdate({
      update_id: updateId++,
      callback_query: {
        id: "1",
        chat_instance: "1",
        data,
        from: { id: USER_ID, is_bot: false, first_name: "Тест" },
        message: { message_id: 1, date: 0, chat: chat(GROUP_CHAT_ID) },
      },
    } as Update);
    assert.deepEqual(texts(), ["Эта команда доступна только админам группы."], data);
  }
});

test("poll answers reach the vote tracker", async () => {
  const place = await addSuggestion("дача", USER_ID, "user2", true);
  await createPoll(GROUP_CHAT_ID, "tg-routing", 1, [place.id, null]);
  const { bot } = makeBot();
  await bot.handleUpdate({
    update_id: updateId++,
    poll_answer: {
      poll_id: "tg-routing",
      user: { id: USER_ID, is_bot: false, first_name: "Тест", username: "user2" },
      option_ids: [0],
    },
  } as Update);
  assert.deepEqual((await listVotes()).map((v) => [v.userId, v.optionIndexes]), [[USER_ID, [0]]]);
});

test("a group → supergroup migration message reaches its handler", async () => {
  const { bot, sent } = makeBot();
  await bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: 1,
      date: 0,
      chat: chat(GROUP_CHAT_ID),
      from: { id: ADMIN_ID, is_bot: false, first_name: "Тест" },
      migrate_to_chat_id: -100123,
    },
  } as Update);
  assert.ok(sent.some((s) => s.method === "sendMessage" && s.payload.chat_id === -100123));
});
