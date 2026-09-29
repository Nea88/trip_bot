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
  scheduleBackups,
  scheduleYearSummary,
  scheduleWeekendNudges,
  runSafely,
  stopAllTasks,
  catchUpYearSummary,
  catchUpBackup,
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
  scheduleBackups(bot.api);
  scheduleYearSummary(bot.api);
  scheduleWeekendNudges(bot.api);

  // Close before create: a missed Sunday close must happen before a missed
  // Monday creation, or the new poll would be skipped as "already open".
  await runSafely(bot.api, "автозакрытие пропущенного опроса при запуске", () =>
    closeMissedScheduledPoll(bot.api),
  );
  await runSafely(bot.api, "создание пропущенного опроса при запуске", () =>
    createMissedScheduledPoll(bot.api),
  );
  await runSafely(bot.api, "пропущенные итоги года", () => catchUpYearSummary(bot.api));
  await runSafely(bot.api, "пропущенная резервная копия", () => catchUpBackup(bot.api));

  const pending = await getPollsWithUnpostedPendingResult();
  for (const poll of pending) {
    try {
      await postPendingResultMessage(bot.api, poll);
    } catch (err) {
      console.error(`[startup] Failed to post pending result for poll ${poll.id}:`, err);
    }
  }

  let healthServer: http.Server | null = null;
  if (env.port) {
    healthServer = http
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

  // Home Assistant stops/updates the add-on with SIGTERM. Stopping the bot
  // properly confirms the last processed update to Telegram — otherwise it
  // re-delivers the last batch after restart and commands get answered twice.
  const shutdown = async (signal: string) => {
    console.log(`[bot] ${signal} received, shutting down…`);
    await stopAllTasks();
    healthServer?.close();
    await bot.stop();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  bot.start({
    // poll_answer is how the bot learns who voted for what (see pollAnswer.ts).
    allowed_updates: ["message", "callback_query", "poll_answer"],
    onStart: (botInfo) => {
      console.log(`[bot] Started as @${botInfo.username}`);
    },
  });
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
