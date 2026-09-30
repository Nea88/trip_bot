import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InputFile } from "grammy";
import { backupCommand } from "../commands/backup.js";
import { OWNER_UNREACHABLE_TEXT, exportAll, importAll, runBackup } from "../services/backup.js";
import { addSuggestion, approveSuggestion, getBySeq } from "../services/suggestions.js";
import { registerForNotifications } from "../services/registrations.js";
import { createPoll } from "../services/polls.js";
import { ADMIN_DM, ADMIN_ID, GROUP_CHAT_ID, OWNER_DM, OWNER_ID, clearFirestore, createFakeApi, createFakeCtx } from "./harness.js";

beforeEach(clearFirestore);

async function seed(): Promise<void> {
  const s = await addSuggestion("дача", ADMIN_ID, "admin", true);
  await approveSuggestion(s.id);
  await createPoll(GROUP_CHAT_ID, "tg", 5, [s.id, null]);
  await registerForNotifications(ADMIN_ID, ADMIN_DM, "admin");
}

test("export → wipe → import restores the same documents, timestamps included", async () => {
  await seed();
  const before = await exportAll();
  assert.ok(Object.keys(before.collections).length >= 4);

  await clearFirestore();
  const written = await importAll(JSON.parse(JSON.stringify(before)), { overwrite: false });
  assert.equal(written, Object.values(before.collections).reduce((n, docs) => n + Object.keys(docs).length, 0));

  const after = await exportAll();
  assert.deepEqual(after.collections, before.collections);
  const place = await getBySeq(1);
  assert.equal(place?.text, "дача");
  assert.equal(typeof place?.addedAt.toMillis(), "number");
});

test("import refuses a non-empty database unless asked to overwrite", async () => {
  await seed();
  const backup = await exportAll();
  await assert.rejects(importAll(backup, { overwrite: false }), /уже есть данные/);
  assert.ok((await importAll(backup, { overwrite: true })) > 0);
});

test("weekly backup is saved to disk and sent to the owner only", async () => {
  await seed();
  await registerForNotifications(OWNER_ID, OWNER_DM, "owner");
  const dir = await mkdtemp(join(tmpdir(), "ride-bot-backup-"));
  const { api, callsTo } = createFakeApi();

  await runBackup(api, dir);

  assert.deepEqual(await readdir(dir), ["ride-bot-backup-2026-09-27.json"]);
  const saved = JSON.parse(await readFile(join(dir, "ride-bot-backup-2026-09-27.json"), "utf8"));
  assert.ok(saved.collections.suggestions);
  const sends = callsTo("sendDocument");
  assert.equal(sends.length, 1);
  assert.equal(sends[0].args[0], OWNER_DM);
  assert.ok(sends[0].args[1] instanceof InputFile);
  assert.match((sends[0].args[2] as { caption: string }).caption, /Резервная копия базы от 27\.09\.2026/);
  assert.equal(callsTo("sendMessage").length, 0);
});

test("weekly backup tells admins when the owner can't be reached", async () => {
  await seed();
  const { api, callsTo } = createFakeApi();

  await runBackup(api, null);

  assert.equal(callsTo("sendDocument").length, 0);
  const [notice] = callsTo("sendMessage");
  assert.equal(notice.args[0], ADMIN_DM);
  assert.equal(notice.args[1], OWNER_UNREACHABLE_TEXT);
});

test("/backup sends the file to the owner who asked", async () => {
  await seed();
  const fake = createFakeCtx(createFakeApi().api, { userId: OWNER_ID, chatId: OWNER_DM });
  await backupCommand(fake.ctx);
  assert.equal(fake.documents.length, 1);
  assert.ok(fake.documents[0].document instanceof InputFile);
  assert.match(fake.documents[0].caption ?? "", /документов/);
});

test("/backup refuses other admins", async () => {
  await seed();
  const fake = createFakeCtx(createFakeApi().api, { userId: ADMIN_ID, chatId: ADMIN_DM });
  await backupCommand(fake.ctx);
  assert.equal(fake.documents.length, 0);
  assert.match(fake.lastReply(), /только владелец группы/);
});
