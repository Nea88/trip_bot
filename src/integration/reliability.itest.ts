import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createPollCommand } from "../commands/createPoll.js";
import { closePollCallback, closePollCommand } from "../commands/closePoll.js";
import { suggestCommand } from "../commands/suggest.js";
import { groupMigratedHandler } from "../commands/groupMigration.js";
import { requireAdmin } from "../bot/middleware/requireAdmin.js";
import { createPollIfPossible } from "../services/pollCreation.js";
import { registerForNotifications } from "../services/registrations.js";
import { addSuggestion, approveSuggestion, getBySeq } from "../services/suggestions.js";
import { listAllPolls } from "../services/polls.js";
import { scheduleFixedJobs, stopAllTasks } from "../scheduler/scheduler.js";
import { FIXED_JOBS } from "../scheduler/fixedJobs.js";
import { validate } from "node-cron";
import {
  ADMIN_DM,
  ADMIN_ID,
  GROUP_CHAT_ID,
  USER_ID,
  clearFirestore,
  createFakeApi,
  createFakeCtx,
} from "./harness.js";

beforeEach(clearFirestore);
after(stopAllTasks);

// Telegram's placeholder sender for admins posting "as the group".
const ANONYMOUS_ADMIN_BOT = 1087968824;

async function addPlaces(count: number): Promise<void> {
  for (let i = 1; i <= count; i++) {
    const s = await addSuggestion(`место ${i}`, ADMIN_ID, "admin", true);
    await approveSuggestion(s.id);
  }
}

test("simultaneous poll creation (schedule + catch-up + /create_poll) sends one poll", async () => {
  await addPlaces(2);
  const { api, callsTo } = createFakeApi();
  const results = await Promise.all([
    createPollIfPossible(api, GROUP_CHAT_ID),
    createPollIfPossible(api, GROUP_CHAT_ID),
    createPollIfPossible(api, GROUP_CHAT_ID),
  ]);

  assert.equal(callsTo("sendPoll").length, 1);
  assert.equal((await listAllPolls()).length, 1);
  assert.equal(results.filter((r) => r.kind === "created").length, 1);
  for (const other of results.filter((res) => res.kind !== "created")) {
    assert.ok(other.kind === "in_progress" || other.kind === "already_open", other.kind);
  }

  // The lock was released: a later call sees the open poll, not "in progress".
  const again = createFakeCtx(api, { userId: ADMIN_ID });
  await createPollCommand(again.ctx);
  assert.match(again.lastReply(), /уже открыт/);
});

test("an admin posting anonymously as the group passes admin checks", async () => {
  const { api } = createFakeApi();
  let passed = false;
  await requireAdmin(
    createFakeCtx(api, { userId: ANONYMOUS_ADMIN_BOT, senderChatId: GROUP_CHAT_ID }).ctx,
    async () => {
      passed = true;
    },
  );
  assert.equal(passed, true);

  // Their /suggest is approved right away, like any admin's.
  const suggest = createFakeCtx(api, {
    userId: ANONYMOUS_ADMIN_BOT,
    senderChatId: GROUP_CHAT_ID,
    match: "Арагац",
    username: "GroupAnonymousBot",
  });
  await suggestCommand(suggest.ctx);
  assert.match(suggest.lastReply(), /Добавлено предложение #1/);
  assert.equal((await getBySeq(1))?.status, "active");
});

test("posting as some other chat doesn't make you an admin", async () => {
  const fake = createFakeCtx(createFakeApi().api, { userId: USER_ID, senderChatId: -100555 });
  let passed = false;
  await requireAdmin(fake.ctx, async () => {
    passed = true;
  });
  assert.equal(passed, false);
  assert.match(fake.lastReply(), /только админам/);
});

test("a confirm button for a place that isn't among the results is refused", async () => {
  await addPlaces(3);
  const { api, callsTo } = createFakeApi({ voteCounts: [1, 3, 0, 0] });
  await createPollCommand(createFakeCtx(api, { userId: ADMIN_ID }).ctx);
  await closePollCommand(createFakeCtx(api, { userId: ADMIN_ID }).ctx);
  const [poll] = await listAllPolls();
  const notACandidate = (await getBySeq(1))!.id; // got 1 vote, the winner is #2

  const tap = createFakeCtx(api, { userId: ADMIN_ID, callbackData: `cp:${poll.id}:confirm:${notACandidate}` });
  await closePollCallback(tap.ctx as never);
  assert.match(tap.edits[0], /кнопка устарела/);
  assert.equal((await getBySeq(1))?.status, "active", "not excluded");
  assert.equal(callsTo("sendMessage").filter((c) => /Съездили в/.test(c.args[1] as string)).length, 0);
});

test("group → supergroup migration: admins are told which id to set", async () => {
  const NEW_ID = -1009999;
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
  const { api, callsTo } = createFakeApi();
  await groupMigratedHandler(
    createFakeCtx(api, { userId: ADMIN_ID, message: { message_id: 7, migrate_to_chat_id: NEW_ID } }).ctx,
  );

  const texts = callsTo("sendMessage").map((c) => ({ chat: c.args[0] as number, text: c.args[1] as string }));
  assert.deepEqual(
    texts.map((t) => t.chat).sort(),
    [ADMIN_DM, NEW_ID].sort(),
  );
  for (const { text } of texts) assert.match(text, /group_chat_id заменят на -1009999/);
});

test("migration notices from other chats are ignored", async () => {
  const { api, calls } = createFakeApi();
  await groupMigratedHandler(
    createFakeCtx(api, { userId: ADMIN_ID, chatId: -100777, message: { message_id: 7, migrate_to_chat_id: -1 } }).ctx,
  );
  assert.equal(calls.length, 0);
});

test("fixed jobs have valid cron expressions", () => {
  for (const job of FIXED_JOBS) assert.ok(validate(job.cron), `${job.name}: ${job.cron}`);
});

test("stopAllTasks stops the fixed-time jobs too (this file would hang otherwise)", async () => {
  scheduleFixedJobs(createFakeApi().api);
  await stopAllTasks();
});
