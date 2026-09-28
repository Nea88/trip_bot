import { InputFile, type Context } from "grammy";
import { prepareBackup } from "../services/backup.js";

// Admin asks for a backup right now; it's sent only to them, in DM.
export async function backupCommand(ctx: Context): Promise<void> {
  const prepared = await prepareBackup();
  await ctx.replyWithDocument(new InputFile(Buffer.from(prepared.json), prepared.fileName), {
    caption: prepared.caption,
  });
}
