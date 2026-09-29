import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { notifyAdmins } from "../services/notifications.js";

/**
 * When a group becomes a supergroup Telegram gives it a new id, and the bot
 * (bound to GROUP_CHAT_ID) stops working there. It can't reconfigure the
 * add-on itself, so it tells admins exactly what to change.
 */
export async function groupMigratedHandler(ctx: Context): Promise<void> {
  const newChatId = ctx.message?.migrate_to_chat_id;
  const config = await getGroupConfig();
  if (!newChatId || ctx.chat?.id !== config.groupChatId) return;

  const text =
    `⚠️ Группа стала супергруппой, и её id сменился: ${config.groupChatId} → ${newChatId}.\n` +
    `Бот заработает в группе снова, когда в настройках аддона group_chat_id заменят на ${newChatId} и перезапустят аддон.`;
  // Admin status is checked in the new supergroup — the old chat is gone.
  await notifyAdmins(ctx.api, newChatId, text);
  try {
    await ctx.api.sendMessage(newChatId, text);
  } catch (err) {
    console.error("[migration] Couldn't post to the new supergroup:", err);
  }
}
