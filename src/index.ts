import http from "node:http";
import { createBot } from "./bot/bot.js";
import { env } from "./config/env.js";
import { rescheduleFromConfig } from "./scheduler/scheduler.js";
import { getPollsWithPendingResult } from "./services/polls.js";
import { postPendingResultMessage } from "./commands/closePoll.js";

async function main(): Promise<void> {
  const bot = createBot();

  await bot.init();

  await rescheduleFromConfig(bot.api);

  const pending = await getPollsWithPendingResult();
  for (const poll of pending) {
    await postPendingResultMessage(bot.api, poll);
  }

  if (env.port) {
    http
      .createServer((_req, res) => {
        res.writeHead(200);
        res.end("ok");
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
