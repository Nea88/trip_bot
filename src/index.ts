import http from "node:http";
import { GrammyError } from "grammy";
import { createBot } from "./bot/bot.js";
import { env } from "./config/env.js";
import {
  createMissedScheduledPoll,
  rescheduleFromConfig,
  rescheduleReminderFromConfig,
  rescheduleCloseFromConfig,
  closeMissedScheduledPoll,
  stopAllTasks,
  scheduleFixedJobs,
  catchUpYearSummary,
  catchUpBackup,
} from "./scheduler/scheduler.js";
import { runSafely } from "./scheduler/runSafely.js";
import { getPollsWithUnpostedPendingResult } from "./services/polls.js";
import { postPendingResultMessage } from "./services/pollClosing.js";
import { registerBotCommands } from "./bot/commands.js";
import { getGroupConfig } from "./services/groupConfig.js";
import { firestoreHealthy } from "./services/health.js";
import { healthStatus } from "./utils/health.js";

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
  scheduleFixedJobs(bot.api);

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
      .createServer(async (_req, res) => {
        const { code, body } = healthStatus({
          botRunning: bot.isRunning(),
          msSinceLastPoll: Date.now() - lastSuccessfulPollAt,
          firestoreOk: await firestoreHealthy(),
        });
        res.writeHead(code);
        res.end(body);
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

  bot
    .start({
      // poll_answer is how the bot learns who voted for what (see pollAnswer.ts).
      allowed_updates: ["message", "callback_query", "poll_answer"],
      onStart: (botInfo) => {
        console.log(`[bot] Started as @${botInfo.username}`);
      },
    })
    // grammY gives up polling only on errors retrying can't fix; exit so the
    // watchdog restarts the add-on, with a log line that says why.
    .catch((err) => {
      if (err instanceof GrammyError && err.error_code === 409) {
        console.error("[bot] Another instance is polling with this token (e.g. npm run dev with the production .env). Stop it.");
      } else if (err instanceof GrammyError && err.error_code === 401) {
        console.error("[bot] Telegram rejected the bot token — check bot_token in the add-on options.");
      }
      console.error("[bot] Polling stopped:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
