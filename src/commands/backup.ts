import { InputFile, type Context } from "grammy";
import { prepareBackup } from "../services/backup.js";
import { isGroupOwner } from "../services/adminAuth.js";
import { getGroupConfig } from "../services/groupConfig.js";

// The group owner asks for a backup right now; it's sent only to them, in DM.
// Other admins are refused: the file holds every member's data.
export async function backupCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  if (!ctx.from || !(await isGroupOwner(ctx.api, config.groupChatId, ctx.from.id))) {
    await ctx.reply("Резервную копию может получить только владелец группы.");
    return;
  }
  const prepared = await prepareBackup();
  await ctx.replyWithDocument(new InputFile(Buffer.from(prepared.json), prepared.fileName), {
    caption: prepared.caption,
  });
}
