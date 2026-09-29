import type { Context } from "grammy";
import { DateTime } from "luxon";
import { getGroupConfig } from "../services/groupConfig.js";
import { getOpenPoll, setMeet } from "../services/polls.js";
import { startWeatherLine } from "../services/weather.js";
import { env } from "../config/env.js";
import { isValidTime } from "../utils/time.js";
import { upcomingTripDate } from "../utils/tripDate.js";
import { now } from "../utils/clock.js";

const USAGE =
  "Использование: /meet <ЧЧ:ММ> <точка старта>, например: /meet 09:00 АЗС на выезде из города.\n" +
  "Можно ответить этой командой на сообщение с геолокацией (📎 → Геопозиция): /meet 09:00 — тогда в группе будет точка на карте и прогноз погоды. Указать нужно до 20:00 пятницы.";

/**
 * Admin sets where and when Saturday's ride starts; the group gets the
 * announcement, plus a map pin and the forecast when a location is given.
 */
export async function meetCommand(ctx: Context): Promise<void> {
  const text = ctx.match?.toString().trim() ?? "";
  const [time, ...rest] = text.split(/\s+/);
  const reply = ctx.message?.reply_to_message;
  const location = reply?.venue?.location ?? reply?.location ?? null;
  const venueName = reply?.venue ? [reply.venue.title, reply.venue.address].filter(Boolean).join(", ") : "";
  const place = rest.join(" ").trim() || venueName || (location ? "точка на карте ниже" : "");

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
  const coords = location ? { latitude: location.latitude, longitude: location.longitude } : null;
  await setMeet(openPoll.id, time, place, coords);

  const tripDate = upcomingTripDate(now(), env.defaultTimezone);
  const lines = [
    `🏁 ${isUpdate ? "Обновлено: с" : "С"}тарт в субботу ${DateTime.fromISO(tripDate).toFormat("dd.LL")} в ${time}`,
    `Точка: ${place}`,
  ];
  if (coords) {
    const weather = await startWeatherLine(coords.latitude, coords.longitude, tripDate, time, env.defaultTimezone);
    if (weather) lines.push(weather);
  }
  await ctx.api.sendMessage(config.groupChatId, lines.join("\n"));
  if (coords) {
    await ctx.api.sendLocation(config.groupChatId, coords.latitude, coords.longitude);
  }
  if (ctx.chat?.id !== config.groupChatId) {
    await ctx.reply("Опубликовано в группе.");
  }
}
