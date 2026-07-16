import { schedule, type ScheduledTask } from "node-cron";
import type { Api } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { createPollIfPossible } from "../services/pollCreation.js";

let currentTask: ScheduledTask | null = null;

async function runScheduledPollCreation(api: Api): Promise<void> {
  const config = await getGroupConfig();
  const result = await createPollIfPossible(api, config.groupChatId);
  if (result.kind === "already_open") {
    console.log("[scheduler] Skipped: a poll is already open.");
  } else if (result.kind === "no_suggestions") {
    console.log("[scheduler] Skipped: no active suggestions.");
  } else {
    console.log(`[scheduler] Created poll with ${result.optionCount} options.`);
  }
}

export async function rescheduleFromConfig(api: Api): Promise<void> {
  if (currentTask) {
    await currentTask.stop();
    currentTask = null;
  }

  const config = await getGroupConfig();
  if (config.scheduleDay === null || config.scheduleTime === null || config.timezone === null) {
    return;
  }

  const [hour, minute] = config.scheduleTime.split(":").map(Number);
  const expression = `${minute} ${hour} * * ${config.scheduleDay}`;

  currentTask = schedule(expression, () => runScheduledPollCreation(api), {
    timezone: config.timezone,
  });
}
