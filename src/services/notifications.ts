import type { Api } from "grammy";
import { isGroupAdmin } from "./adminAuth.js";
import { getAllRegistrations } from "./registrations.js";

export async function notifyAdmins(
  api: Api,
  groupChatId: number,
  text: string,
): Promise<void> {
  const registrations = await getAllRegistrations();
  await Promise.all(
    registrations.map(async ({ userId, registration }) => {
      const admin = await isGroupAdmin(api, groupChatId, userId);
      if (!admin) return;
      try {
        await api.sendMessage(registration.dmChatId, text);
      } catch {
        // Registered user may have blocked the bot; skip silently.
      }
    }),
  );
}
