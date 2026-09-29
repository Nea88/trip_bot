import type { Api } from "grammy";
import { env } from "../config/env.js";
import { now } from "../utils/clock.js";
import { escapeHtml } from "../utils/html.js";
import { mentionHtml } from "../utils/userName.js";
import { buildMessageLink } from "../utils/photoMessage.js";
import { missingVoters } from "../utils/participation.js";
import { getGroupConfig } from "./groupConfig.js";
import { getOpenPoll } from "./polls.js";
import { listVotes } from "./pollVotes.js";
import { startWeatherLine } from "./weather.js";

/**
 * Saturday morning: remind the group of today's start (set with /meet),
 * with the forecast and map pin when a location was given. Silent if no
 * start was set.
 */
export async function postStartDayReminder(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const poll = await getOpenPoll(config.groupChatId);
  if (!poll?.meetTime || !poll.meetPlace) return;

  const hasCoords = poll.meetLatitude != null && poll.meetLongitude != null;
  const lines = [`☀️ Сегодня поездка! Старт в ${poll.meetTime}`, `Точка: ${poll.meetPlace}`];
  if (hasCoords) {
    const today = now().setZone(env.defaultTimezone).toISODate()!;
    const weather = await startWeatherLine(poll.meetLatitude!, poll.meetLongitude!, today, poll.meetTime, env.defaultTimezone);
    if (weather) lines.push(weather);
  }
  await api.sendMessage(config.groupChatId, lines.join("\n"));
  if (hasCoords) await api.sendLocation(config.groupChatId, poll.meetLatitude!, poll.meetLongitude!);
}

/**
 * Before the start is decided: mention regulars (voted in earlier polls) who
 * haven't voted in this week's poll. Votes are also how the bot knows who
 * went, so this keeps /me and the year summary honest.
 */
export async function remindNonVoters(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const poll = await getOpenPoll(config.groupChatId);
  if (!poll) return;

  const missing = missingVoters(await listVotes(), poll.id);
  if (missing.length === 0) return;

  const link = buildMessageLink(config.groupChatId, poll.messageId);
  const mentions = missing.map((v) => mentionHtml(v.userId, v.username)).join(", ");
  await api.sendMessage(
    config.groupChatId,
    `🗳 ${mentions} — вы ещё не проголосовали в <a href="${escapeHtml(link)}">опросе</a>. ` +
      "Выберите, куда едем, или «Мимокрокодил», если в этот раз не получается.",
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
  );
}

