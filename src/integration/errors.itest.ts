import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { BotError } from "grammy";
import { handleBotError } from "../bot/bot.js";
import { runSafely } from "../scheduler/scheduler.js";
import { registerForNotifications } from "../services/registrations.js";
import { ADMIN_DM, ADMIN_ID, USER_ID, clearFirestore, createFakeApi, createFakeCtx } from "./harness.js";

beforeEach(clearFirestore);

test("a failed background job is reported to admins with the reason only", async () => {
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  const { api, callsTo } = createFakeApi();

  await runSafely(api, "автозакрытие опроса", async () => {
    throw new Error("Firestore недоступен");
  });

  const [dm] = callsTo("sendMessage").filter((c) => c.args[0] === ADMIN_DM);
  assert.equal(dm.args[1], "⚠️ Не получилось: автозакрытие опроса. Firestore недоступен\nПодробности — в логах бота.");
});

test("a successful job tells nobody", async () => {
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  const { api, calls } = createFakeApi();
  await runSafely(api, "что-то", async () => {});
  assert.equal(calls.length, 0);
});

test("a failed button handler answers the press instead of leaving it spinning", async () => {
  const { api } = createFakeApi();
  const fake = createFakeCtx(api, { userId: ADMIN_ID, callbackData: "cp:x:confirm:y" });
  await handleBotError(new BotError(new Error("boom"), fake.ctx));
  assert.deepEqual(fake.callbackAnswers, ["Что-то пошло не так. Попробуйте ещё раз позже."]);
  assert.deepEqual(fake.replies, []);
});

test("a failed command gets a text reply", async () => {
  const { api } = createFakeApi();
  const fake = createFakeCtx(api, { userId: USER_ID, match: "1" });
  await handleBotError(new BotError(new Error("boom"), fake.ctx));
  assert.match(fake.lastReply(), /Что-то пошло не так/);
});
