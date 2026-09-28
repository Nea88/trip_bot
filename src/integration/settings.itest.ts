import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setReminderTimeCommand } from "../commands/setReminderTime.js";
import { setReminderTextCommand } from "../commands/setReminderText.js";
import { getReminderCommand } from "../commands/getReminder.js";
import { setCloseScheduleCommand, setScheduleCommand } from "../commands/setSchedule.js";
import { getScheduleCommand } from "../commands/getSchedule.js";
import { startCommand } from "../commands/start.js";
import { helpCommand } from "../commands/help.js";
import { runReminder, stopConfigurableTasks } from "../scheduler/scheduler.js";
import { getAllRegistrations } from "../services/registrations.js";
import { menuFor } from "../bot/commandSpecs.js";
import { DEFAULT_REMINDER_TEXT } from "../constants.js";
import { setClock } from "../utils/clock.js";
import {
  ADMIN_DM,
  ADMIN_ID,
  GROUP_CHAT_ID,
  NOW,
  USER_ID,
  clearFirestore,
  createFakeApi,
  createFakeCtx,
} from "./harness.js";

beforeEach(async () => {
  await clearFirestore();
  setClock(() => NOW);
});
// Schedule commands start cron timers; stop them so the test process exits.
after(stopConfigurableTasks);

async function run(handler: (ctx: never) => Promise<void>, match: string, userId = ADMIN_ID, chatId?: number) {
  const { api, callsTo } = createFakeApi();
  const fake = createFakeCtx(api, { userId, match, chatId });
  await handler(fake.ctx as never);
  return { ...fake, callsTo };
}

test("reminder time and text are set, shown, and a timezone argument is refused", async () => {
  const empty = (await run(getReminderCommand, "")).lastReply();
  assert.match(empty, /Время: не задано/);
  assert.match(empty, /по умолчанию/);

  assert.match((await run(setReminderTimeCommand, "12:00 UTC")).lastReply(), /настройках аддона.*Europe\/Moscow/);
  assert.match((await run(setReminderTimeCommand, "25:00")).lastReply(), /Неверный формат времени/);
  assert.match((await run(setReminderTimeCommand, "12:30")).lastReply(), /через день в 12:30 \(Europe\/Moscow\)/);
  assert.match((await run(setReminderTextCommand, "Куда едем? /suggest")).lastReply(), /Текст памятки обновлён/);

  const shown = (await run(getReminderCommand, "")).lastReply();
  assert.match(shown, /Время: 12:30 \(Europe\/Moscow\)/);
  assert.match(shown, /Текст \(свой\):\nКуда едем\? \/suggest/);
});

test("the reminder goes out every other day", async () => {
  const { api, callsTo } = createFakeApi();
  const sent = () => callsTo("sendMessage").filter((c) => c.args[0] === GROUP_CHAT_ID).length;

  await runReminder(api);
  assert.equal(sent(), 1);
  assert.equal(callsTo("sendMessage")[0].args[1], DEFAULT_REMINDER_TEXT);

  setClock(() => NOW.plus({ days: 1 }));
  await runReminder(api);
  assert.equal(sent(), 1, "skipped the next day");

  setClock(() => NOW.plus({ days: 2 }));
  await runReminder(api);
  assert.equal(sent(), 2, "sent again two days later");
});

test("schedule commands take day and time only; /get_schedule shows both", async () => {
  assert.match((await run(getScheduleCommand, "")).lastReply(), /не задано \(\/set_schedule\)[\s\S]*не задано \(\/set_close_schedule\)/);
  assert.match((await run(setScheduleCommand, "monday 10:00 UTC")).lastReply(), /настройках аддона/);
  assert.match((await run(setScheduleCommand, "понедельник 10:00")).lastReply(), /Не распознан день недели/);
  assert.match((await run(setScheduleCommand, "monday")).lastReply(), /Использование/);

  assert.match((await run(setScheduleCommand, "monday 10:00")).lastReply(), /создания опроса: monday 10:00 \(Europe\/Moscow\)/);
  assert.match((await run(setCloseScheduleCommand, "sunday 12:00")).lastReply(), /закрываться автоматически: sunday 12:00/);

  const shown = (await run(getScheduleCommand, "")).lastReply();
  assert.match(shown, /Создание опроса: понедельник в 10:00 \(Europe\/Moscow\)/);
  assert.match(shown, /Закрытие опроса: воскресенье в 12:00 \(Europe\/Moscow\)/);
});

test("/start registers the admin and sets their private menu; members get no admin menu", async () => {
  const admin = await run(startCommand, "", ADMIN_ID, ADMIN_DM);
  assert.match(admin.lastReply(), /Готово/);
  assert.deepEqual(
    (await getAllRegistrations()).map((r) => [r.userId, r.registration.dmChatId]),
    [[ADMIN_ID, ADMIN_DM]],
  );
  const [menu] = admin.callsTo("setMyCommands");
  assert.deepEqual(menu.args[0], menuFor("privateAdmin"));
  assert.deepEqual(menu.args[1], { scope: { type: "chat", chat_id: ADMIN_DM } });

  const member = await run(startCommand, "", USER_ID, 202);
  assert.equal(member.callsTo("setMyCommands").length, 0);
});

test("/help shows admin commands only to admins", async () => {
  const forMember = (await run(helpCommand, "", USER_ID)).lastReply();
  assert.match(forMember, /\/suggest/);
  assert.doesNotMatch(forMember, /\/close_poll|Команды для админов/);

  const forAdmin = (await run(helpCommand, "", ADMIN_ID)).lastReply();
  assert.match(forAdmin, /Команды для админов группы/);
  assert.match(forAdmin, /\/close_poll/);
  assert.match(forAdmin, /\/backup/);
});
