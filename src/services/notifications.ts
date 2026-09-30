import type { Api, InlineKeyboard } from "grammy";
import { isGroupAdmin, isGroupOwner } from "./adminAuth.js";
import { getAllRegistrations } from "./registrations.js";
import { sendPlaceItems, type PlaceItemRef } from "../utils/photoMessage.js";

// Added to replies when a request for review reached no admin at all.
export const NO_ADMINS_NOTE =
  "\n\n⚠️ Ни один админ сейчас не подписан на уведомления, так что запрос никто не увидит. Попросите админа написать боту /start в личных сообщениях — после этого запрос будет в /pending.";

/**
 * Runs `send` for the DM of every registered user who is still a group
 * admin. Returns how many admins it actually reached.
 */
export async function forEachAdminDm(
  api: Api,
  groupChatId: number,
  send: (dmChatId: number) => Promise<void>,
): Promise<number> {
  const registrations = await getAllRegistrations();
  const delivered = await Promise.all(
    registrations.map(async ({ userId, registration }) => {
      const admin = await isGroupAdmin(api, groupChatId, userId);
      if (!admin) return false;
      try {
        await send(registration.dmChatId);
        return true;
      } catch {
        // Registered user may have blocked the bot; skip silently.
        return false;
      }
    }),
  );
  return delivered.filter(Boolean).length;
}

/**
 * Runs `send` for the group owner's DM, if the owner registered with /start.
 * Returns whether it got through.
 */
export async function sendToOwnerDm(
  api: Api,
  groupChatId: number,
  send: (dmChatId: number) => Promise<void>,
): Promise<boolean> {
  for (const { userId, registration } of await getAllRegistrations()) {
    if (!(await isGroupOwner(api, groupChatId, userId))) continue;
    try {
      await send(registration.dmChatId);
      return true;
    } catch (err) {
      console.error("[notifications] Failed to reach the group owner:", err);
      return false;
    }
  }
  return false;
}

export async function notifyAdmins(
  api: Api,
  groupChatId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<number> {
  return forEachAdminDm(api, groupChatId, async (dmChatId) => {
    await api.sendMessage(dmChatId, text, { reply_markup: keyboard });
  });
}

// Albums can't carry buttons, so the items go first and the text with the
// keyboard follows right after them.
export async function notifyAdminsWithItems(
  api: Api,
  groupChatId: number,
  items: PlaceItemRef[],
  text: string,
  keyboard: InlineKeyboard,
): Promise<number> {
  return forEachAdminDm(api, groupChatId, async (dmChatId) => {
    await sendPlaceItems(api, dmChatId, items);
    await api.sendMessage(dmChatId, text, { reply_markup: keyboard });
  });
}
