import type { Context } from "grammy";
import { registerForNotifications } from "../services/registrations.js";

export async function startCommand(ctx: Context): Promise<void> {
  const userId = ctx.from!.id;
  const chatId = ctx.chat!.id;
  const username = ctx.from!.username ?? ctx.from!.first_name ?? "друг";

  await registerForNotifications(userId, chatId, username);
  await ctx.reply(
    "Готово! Если вы админ группы, теперь будете получать уведомления о новых предложениях маршрутов.",
  );
}
