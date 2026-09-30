import type { Context } from "grammy";
import { DateTime } from "luxon";
import { getGroupConfig } from "../services/groupConfig.js";
import { getOpenPoll } from "../services/polls.js";
import { cancelOpenPoll, CLOSE_OUTCOME_TEXT } from "../services/pollClosing.js";
import { listVotesForPoll } from "../services/pollVotes.js";
import { plannedRiders } from "../utils/participation.js";
import { upcomingTripDate } from "../utils/tripDate.js";
import { mentionHtml } from "../utils/userName.js";
import { escapeHtml } from "../utils/html.js";
import { now } from "../utils/clock.js";
import { env } from "../config/env.js";

const MAX_REASON = 300;

/**
 * Admin calls off Saturday's ride (weather, too few riders…): the poll is
 * closed without a winner, so the places stay in the pool and the Saturday
 * start post and Sunday auto-close have nothing to act on. Everyone who voted
 * for a place is mentioned, so the news reaches them.
 */
export async function cancelRideCommand(ctx: Context): Promise<void> {
  const reason = ctx.match?.toString().trim().slice(0, MAX_REASON) ?? "";
  const config = await getGroupConfig();
  const poll = await getOpenPoll(config.groupChatId);
  if (!poll) {
    await ctx.reply("Сейчас нет открытого опроса — отменять нечего.");
    return;
  }
  const riders = plannedRiders(await listVotesForPoll(poll.id), poll.optionSuggestionIds);

  const outcome = await cancelOpenPoll(ctx.api, config.groupChatId);
  if (outcome !== "cancelled") {
    await ctx.reply(CLOSE_OUTCOME_TEXT[outcome]);
    return;
  }

  const day = DateTime.fromISO(upcomingTripDate(now(), env.defaultTimezone)).toFormat("dd.LL");
  const lines = [`🚫 Поездка в субботу ${day} отменяется${reason ? `. Причина: ${escapeHtml(reason)}` : "."}`];
  if (riders.length > 0) {
    lines.push(`${riders.map((r) => mentionHtml(r.userId, r.username)).join(", ")} — вы собирались ехать, в этот раз без поездки.`);
  }
  lines.push("Места из опроса остаются в пуле.");
  await ctx.api.sendMessage(config.groupChatId, lines.join("\n"), { parse_mode: "HTML" });
  if (ctx.chat?.id !== config.groupChatId) {
    await ctx.reply("Отмена опубликована в группе.");
  }
}
