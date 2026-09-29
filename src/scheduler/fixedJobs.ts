import type { Api } from "grammy";
import { sendTripMemories } from "../services/memories.js";
import { runBackup } from "../services/backup.js";
import { postYearSummary } from "../services/yearSummary.js";
import { postStartDayReminder, remindAboutMeet, remindNonVoters } from "../services/weekendNudges.js";

export interface FixedJob {
  // Shown to admins if the job fails ("⚠️ Не получилось: <name>").
  name: string;
  // node-cron expression, in DEFAULT_TIMEZONE.
  cron: string;
  run: (api: Api) => Promise<void>;
}

/**
 * Jobs at fixed times (unlike the poll/close/reminder schedules admins set).
 * One place to see the bot's whole week.
 */
export const FIXED_JOBS: FixedJob[] = [
  { name: "пост «В этот день»", cron: "0 12 * * *", run: sendTripMemories },
  // Before the start is set by Friday 20:00: nudge regulars who haven't voted.
  { name: "напоминание проголосовать", cron: "0 12 * * 5", run: remindNonVoters },
  // The meeting point must be set by Friday 20:00: heads-up, then a nudge.
  { name: "напоминание про точку старта", cron: "0 18 * * 5", run: (api) => remindAboutMeet(api, false) },
  { name: "напоминание про точку старта", cron: "0 20 * * 5", run: (api) => remindAboutMeet(api, true) },
  { name: "утреннее напоминание о старте", cron: "0 7 * * 6", run: postStartDayReminder },
  // Sunday night, when nothing else is going on.
  { name: "резервная копия базы", cron: "0 3 * * 0", run: (api) => runBackup(api) },
  { name: "итоги года", cron: "0 12 31 12 *", run: (api) => postYearSummary(api) },
];
