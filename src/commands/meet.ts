import type { Context } from "grammy";
import { DateTime } from "luxon";
import { getGroupConfig } from "../services/groupConfig.js";
import { getOpenPoll, setMeet } from "../services/polls.js";
import { env } from "../config/env.js";
import { isValidTime } from "../utils/time.js";
import { upcomingTripDate } from "../utils/tripDate.js";

const USAGE =
  "Использование: /meet <ЧЧ:ММ> <точка старта>, например: /meet 09:00 АЗС на выезде из города. Указать нужно до 20:00 пятницы.";

// Admin sets where and when Saturday's ride starts; the group gets the announcement.
export async function meetCommand(ctx: Context): Promise<void> {
  const text = ctx.match?.toString().trim() ?? "";
  const [time, ...rest] = text.split(/\s+/);
  const place = rest.join(" ").trim();
  if (!time || !place) {
    await ctx.reply(USAGE);
    return;
  }
  if (!isValidTime(time)) {
    await ctx.reply(`Неверный формат времени "${time}", ожидается ЧЧ:ММ.\n${USAGE}`);
    return;
  }

  const config = await getGroupConfig();
  const openPoll = await getOpenPoll(config.groupChatId);
  if (!openPoll) {
    await ctx.reply("Сейчас нет открытого опроса — точку старта привязать не к чему.");
    return;
  }

  const isUpdate = Boolean(openPoll.meetTime);
  await setMeet(openPoll.id, time, place);

  const day = DateTime.fromISO(upcomingTripDate(DateTime.now(), env.defaultTimezone)).toFormat("dd.LL");
  await ctx.api.sendMessage(
    config.groupChatId,
    `🏁 ${isUpdate ? "Обновлено: с" : "С"}тарт в субботу ${day} в ${time}\nТочка: ${place}`,
  );
  if (ctx.chat?.id !== config.groupChatId) {
    await ctx.reply("Опубликовано в группе.");
  }
}
