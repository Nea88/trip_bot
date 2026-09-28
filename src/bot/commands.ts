import type { Api } from "grammy";
import { getAllRegistrations } from "../services/registrations.js";
import { isGroupAdmin } from "../services/adminAuth.js";
import { menuFor } from "./commandSpecs.js";

export async function registerBotCommands(api: Api, groupChatId: number): Promise<void> {
  await api.setMyCommands(menuFor("private").filter((c) => c.command === "help"));
  await api.setMyCommands(menuFor("private"), { scope: { type: "all_private_chats" } });
  await api.setMyCommands(menuFor("group"), { scope: { type: "all_group_chats" } });
  await api.setMyCommands(menuFor("groupAdmin"), {
    scope: { type: "chat_administrators", chat_id: groupChatId },
  });

  const registrations = await getAllRegistrations();
  await Promise.all(
    registrations.map(({ userId, registration }) =>
      registerPrivateAdminCommands(api, groupChatId, userId, registration.dmChatId),
    ),
  );
}

export async function registerPrivateAdminCommands(
  api: Api,
  groupChatId: number,
  userId: number,
  dmChatId: number,
): Promise<void> {
  const admin = await isGroupAdmin(api, groupChatId, userId);
  if (!admin) return;
  await api.setMyCommands(menuFor("privateAdmin"), { scope: { type: "chat", chat_id: dmChatId } });
}
