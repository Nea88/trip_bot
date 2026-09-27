import type { Api, InlineKeyboard } from "grammy";
import { isGroupAdmin } from "./adminAuth.js";
import { getAllRegistrations } from "./registrations.js";
import { sendPhotoAlbums } from "../utils/photoMessage.js";

// Runs `send` for the DM of every registered user who is still a group admin.
async function forEachAdminDm(
  api: Api,
  groupChatId: number,
  send: (dmChatId: number) => Promise<void>,
): Promise<void> {
  const registrations = await getAllRegistrations();
  await Promise.all(
    registrations.map(async ({ userId, registration }) => {
      const admin = await isGroupAdmin(api, groupChatId, userId);
      if (!admin) return;
      try {
        await send(registration.dmChatId);
      } catch {
        // Registered user may have blocked the bot; skip silently.
      }
    }),
  );
}

export async function notifyAdmins(
  api: Api,
  groupChatId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  await forEachAdminDm(api, groupChatId, async (dmChatId) => {
    await api.sendMessage(dmChatId, text, { reply_markup: keyboard });
  });
}

// Albums can't carry buttons, so the photos go first and the text with the
// keyboard follows right after them.
export async function notifyAdminsWithPhotos(
  api: Api,
  groupChatId: number,
  fileIds: string[],
  text: string,
  keyboard: InlineKeyboard,
): Promise<void> {
  await forEachAdminDm(api, groupChatId, async (dmChatId) => {
    await sendPhotoAlbums(api, dmChatId, fileIds);
    await api.sendMessage(dmChatId, text, { reply_markup: keyboard });
  });
}
