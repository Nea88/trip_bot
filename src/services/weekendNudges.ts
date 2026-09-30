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
import { startWeather, startWeatherLine } from "./weather.js";
import { formatWeather, weatherWarnings } from "../utils/weather.js";
import { upcomingTripDate } from "../utils/tripDate.js";
import { notifyAdmins } from "./notifications.js";

const MEET_EXAMPLE = "/meet 09:00 АЗС на выезде из города";

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


/**
 * Friday check that an admin has set where and when Saturday's ride starts
 * (/meet). Only while a poll is open — that's the trip being planned.
 */
export async function remindAboutMeet(api: Api, deadlinePassed: boolean): Promise<void> {
  const config = await getGroupConfig();
  const openPoll = await getOpenPoll(config.groupChatId);
  if (!openPoll || openPoll.meetTime) return;

  const text = deadlinePassed
    ? `Уже 20:00 пятницы, а точка и время старта на завтра не указаны. Укажите: ${MEET_EXAMPLE}`
    : `До 20:00 нужно указать точку и время старта субботней поездки: ${MEET_EXAMPLE}`;
  await notifyAdmins(api, config.groupChatId, text);
}

/**
 * Friday evening, once the start is set: if the forecast for its hour is
 * severe, admins hear it while there's still time to call the ride off.
 * Needs the start's location (/meet in reply to a geo pin).
 */
export async function warnAboutWeather(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const poll = await getOpenPoll(config.groupChatId);
  if (!poll?.meetTime || poll.meetLatitude == null || poll.meetLongitude == null) return;

  const tripDate = upcomingTripDate(now(), env.defaultTimezone);
  const hour = await startWeather(poll.meetLatitude, poll.meetLongitude, tripDate, poll.meetTime, env.defaultTimezone);
  const warnings = hour ? weatherWarnings(hour) : [];
  if (!hour || warnings.length === 0) return;

  await notifyAdmins(
    api,
    config.groupChatId,
    `⚠️ Плохой прогноз на завтрашний старт в ${poll.meetTime}: ${warnings.join(", ")}.\n` +
      `${formatWeather(hour)}\n` +
      "Если решите отменить поездку — /cancel_ride <причина>, группа получит объявление.",
  );
}
