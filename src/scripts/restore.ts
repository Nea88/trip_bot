// Restores a backup made by /backup or the weekly job:
//   npm run restore -- <file.json> [--overwrite]      (from sources, uses .env)
//   node dist/scripts/restore.js <file.json> [--overwrite]
import { readFile } from "node:fs/promises";
import { importAll } from "../services/backup.js";
import type { BackupFile } from "../services/backupFormat.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const overwrite = args.includes("--overwrite");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Использование: npm run restore -- <файл резервной копии> [--overwrite]");
    process.exit(2);
  }

  const backup = JSON.parse(await readFile(file, "utf8")) as BackupFile;
  const written = await importAll(backup, { overwrite });
  console.log(`Восстановлено документов: ${written} (копия от ${backup.createdAt}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
