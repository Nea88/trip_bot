import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { getOpenPoll } from "../services/polls.js";
import { postRouteMap } from "../services/routeMap.js";

/**
 * Posts the open poll's route map again — e.g. after /edit made a place
 * findable on the map.
 */
export async function routeMapCommand(ctx: Context): Promise<void> {
  const config = await getGroupConfig();
  const poll = await getOpenPoll(config.groupChatId);
  if (!poll) {
    await ctx.reply("Сейчас нет открытого опроса.");
    return;
  }

  const posted = await postRouteMap(ctx.api, poll);
  await ctx.reply(
    posted
      ? "Карта маршрутов опубликована в группе ответом на опрос."
      : "Не получилось нарисовать карту: ни один вариант не нашёлся на карте или OpenStreetMap недоступен. " +
        "Помогает название вида «Старт — Через — Финиш» с названиями сёл (поправить: /edit <номер> <текст>). " +
        "Про ненайденные точки бот спрашивает владельца группы в личке.",
  );
}
