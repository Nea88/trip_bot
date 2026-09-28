import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import { deserializeValue, saveBackupFile, serializeValue } from "./backupFormat.js";

test("Timestamps survive a JSON round trip with full precision, nested too", () => {
  const original = {
    addedAt: new Timestamp(1790000000, 123456789),
    nested: { list: [new Timestamp(1, 2), "x", 3, null] },
    plain: "текст",
  };
  const back = deserializeValue(JSON.parse(JSON.stringify(serializeValue(original)))) as typeof original;
  assert.ok(back.addedAt instanceof Timestamp);
  assert.ok(back.addedAt.isEqual(original.addedAt));
  assert.ok((back.nested.list[0] as Timestamp).isEqual(new Timestamp(1, 2)));
  assert.deepEqual(back.nested.list.slice(1), ["x", 3, null]);
  assert.equal(back.plain, "текст");
});

test("saveBackupFile keeps the newest N and overwrites the same day", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ride-bot-backups-"));
  await writeFile(join(dir, "unrelated.txt"), "keep me");
  for (const day of ["2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27"]) {
    await saveBackupFile(dir, day, `{"day":"${day}"}`, 2);
  }
  await saveBackupFile(dir, "2026-09-27", '{"day":"again"}', 2);

  assert.deepEqual((await readdir(dir)).sort(), [
    "ride-bot-backup-2026-09-20.json",
    "ride-bot-backup-2026-09-27.json",
    "unrelated.txt",
  ]);
  assert.equal(await readFile(join(dir, "ride-bot-backup-2026-09-27.json"), "utf8"), '{"day":"again"}');
});
