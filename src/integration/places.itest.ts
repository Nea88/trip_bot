import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { editCommand } from "../commands/edit.js";
import { excludeCommand } from "../commands/exclude.js";
import { restoreCommand } from "../commands/restore.js";
import { excludedCommand } from "../commands/excluded.js";
import { listCommand } from "../commands/list.js";
import { getOpenPollCommand } from "../commands/getOpenPoll.js";
import { createPollCommand } from "../commands/createPoll.js";
import { photoCommand } from "../commands/photo.js";
import { addSuggestion, approveSuggestion, getBySeq } from "../services/suggestions.js";
import { ADMIN_ID, USER_ID, clearFirestore, createFakeApi, createFakeCtx, photoSizes } from "./harness.js";

beforeEach(clearFirestore);

async function addPlaces(...texts: string[]): Promise<void> {
  for (const text of texts) {
    const s = await addSuggestion(text, USER_ID, "vasya", true);
    await approveSuggestion(s.id);
  }
}

async function run(handler: (ctx: never) => Promise<void>, match: string, userId = ADMIN_ID) {
  const { api } = createFakeApi();
  const fake = createFakeCtx(api, { userId, match });
  await handler(fake.ctx as never);
  return fake;
}

test("/edit renames a place, validating the text", async () => {
  await addPlaces("дача");
  assert.match((await run(editCommand, "1 озеро Селигер")).lastReply(), /#1 обновлено: "дача" → "озеро Селигер"/);
  assert.equal((await getBySeq(1))?.text, "озеро Селигер");
  assert.match((await run(editCommand, "1 ab")).lastReply(), /Слишком коротко/);
  assert.match((await run(editCommand, "1")).lastReply(), /Использование/);
  assert.match((await run(editCommand, "7 где-то")).lastReply(), /#7 не найдено/);
});

test("/edit can't rename a place into another existing one", async () => {
  await addPlaces("дача", "озеро");
  assert.match((await run(editCommand, "2 Дача")).lastReply(), /уже есть: #1 "дача"/);
  assert.equal((await getBySeq(2))?.text, "озеро");
  // Changing only the case of its own name is fine.
  assert.match((await run(editCommand, "1 Дача")).lastReply(), /обновлено/);
});

test("/exclude → /excluded → /restore round trip", async () => {
  await addPlaces("дача", "озеро");
  assert.match((await run(excludeCommand, "1")).lastReply(), /"дача" исключено из пула/);
  assert.match((await run(excludeCommand, "1")).lastReply(), /Активное предложение #1 не найдено/);

  const excluded = await run(excludedCommand, "");
  assert.match(excluded.lastReply(), /^#1: дача \(исключено \d\d\.\d\d\.\d{4}\)$/);

  assert.match((await run(restoreCommand, "2")).lastReply(), /Исключённое предложение #2 не найдено/);
  assert.match((await run(restoreCommand, "1")).lastReply(), /"дача" возвращено/);
  assert.equal((await getBySeq(1))?.status, "active");
  assert.match((await run(excludedCommand, "")).lastReply(), /Исключённых мест нет/);
});

test("/list shows active places with author and photo count", async () => {
  assert.match((await run(listCommand, "", USER_ID)).lastReply(), /Активных предложений пока нет/);
  await addPlaces("дача", "озеро");
  await photoCommand(
    createFakeCtx(createFakeApi().api, { userId: ADMIN_ID, match: "2", replyTo: { message_id: 3, photo: photoSizes("l") } }).ctx,
  );

  const text = (await run(listCommand, "", USER_ID)).lastReply();
  assert.match(text, /^#1: дача \(добавил @vasya, \d\d\.\d\d\.\d{4}\)$/m);
  assert.match(text, /^#2: озеро 📷 1 \(добавил @vasya/m);
});

test("/list splits a long list into several messages", async () => {
  await addPlaces(...Array.from({ length: 45 }, (_, i) => `место номер ${i + 1} ${"очень длинное название ".repeat(3)}`));
  const { replies } = await run(listCommand, "", USER_ID);
  assert.ok(replies.length >= 2, `expected several messages, got ${replies.length}`);
  for (const reply of replies) assert.ok(reply.length <= 4096);
  assert.equal(replies.join("\n").split("\n").length, 45);
});

test("/get_open_poll links to the open poll", async () => {
  assert.match((await run(getOpenPollCommand, "")).lastReply(), /нет открытого опроса/);
  await addPlaces("дача");
  const { api } = createFakeApi();
  await createPollCommand(createFakeCtx(api, { userId: ADMIN_ID }).ctx);
  assert.match((await run(getOpenPollCommand, "")).lastReply(), /^https:\/\/t\.me\/c\/1000\/\d+$/);
});
