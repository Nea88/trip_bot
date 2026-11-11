import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { getOpenPoll } from "../services/polls.js";
import { getById } from "../services/suggestions.js";
import { postRouteMap } from "../services/routeMap.js";
import type { SuggestionWithId } from "../types/index.js";

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

  const options = (
    await Promise.all(poll.optionSuggestionIds.map((id) => (id ? getById(id) : null)))
  ).filter((s): s is SuggestionWithId => s !== null);
  const posted = await postRouteMap(ctx.api, config.groupChatId, options, poll.messageId);
  await ctx.reply(
    posted
      ? "Карта маршрутов опубликована в группе ответом на опрос."
      : "Не получилось нарисовать карту: ни один вариант не нашёлся на карте или OpenStreetMap недоступен. " +
        "Помогает название вида «Старт — Финиш» с названиями сёл (поправить: /edit <номер> <текст>).",
  );
}
