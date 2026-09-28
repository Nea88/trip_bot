import http from "node:http";
import { createBot } from "./bot/bot.js";
import { env } from "./config/env.js";
import {
  createMissedScheduledPoll,
  rescheduleFromConfig,
  rescheduleReminderFromConfig,
  scheduleTripMemories,
  rescheduleCloseFromConfig,
  closeMissedScheduledPoll,
  scheduleMeetReminders,
  runSafely,
} from "./scheduler/scheduler.js";
import { getPollsWithUnpostedPendingResult } from "./services/polls.js";
import { postPendingResultMessage } from "./services/pollClosing.js";
import { registerBotCommands } from "./bot/commands.js";
import { getGroupConfig } from "./services/groupConfig.js";

// Long polling holds each getUpdates call open for up to 30s, so a healthy
// bot completes one well within this window.
const HEALTHY_POLL_WINDOW_MS = 90_000;

async function main(): Promise<void> {
  const bot = createBot();

  let lastSuccessfulPollAt = 0;
  bot.api.config.use(async (prev, method, payload, signal) => {
    const result = await prev(method, payload, signal);
    if (method === "getUpdates" && result.ok) lastSuccessfulPollAt = Date.now();
    return result;
  });

  await bot.init();

  const groupConfig = await getGroupConfig();
  await registerBotCommands(bot.api, groupConfig.groupChatId);

  await rescheduleFromConfig(bot.api);
  await rescheduleReminderFromConfig(bot.api);
  await rescheduleCloseFromConfig(bot.api);
  scheduleTripMemories(bot.api);
  scheduleMeetReminders(bot.api);

  // Close before create: a missed Sunday close must happen before a missed
  // Monday creation, or the new poll would be skipped as "already open".
  await runSafely(bot.api, "автозакрытие пропущенного опроса при запуске", () =>
    closeMissedScheduledPoll(bot.api),
  );
  await runSafely(bot.api, "создание пропущенного опроса при запуске", () =>
    createMissedScheduledPoll(bot.api),
  );

  const pending = await getPollsWithUnpostedPendingResult();
  for (const poll of pending) {
    try {
      await postPendingResultMessage(bot.api, poll);
    } catch (err) {
      console.error(`[startup] Failed to post pending result for poll ${poll.id}:`, err);
    }
  }

  if (env.port) {
    http
      .createServer((_req, res) => {
        const healthy =
          bot.isRunning() && Date.now() - lastSuccessfulPollAt < HEALTHY_POLL_WINDOW_MS;
        res.writeHead(healthy ? 200 : 503);
        res.end(healthy ? "ok" : "unhealthy");
      })
      .listen(env.port, () => {
        console.log(`[http] Healthcheck server listening on port ${env.port}`);
      });
  }

  bot.start({
    onStart: (botInfo) => {
      console.log(`[bot] Started as @${botInfo.username}`);
    },
  });
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
