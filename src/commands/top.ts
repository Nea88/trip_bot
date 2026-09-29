import type { Context } from "grammy";
import { loadYearData } from "../services/yearSummary.js";
import { env } from "../config/env.js";
import { now } from "../utils/clock.js";
import { formatTop } from "../utils/leaderboard.js";

const TOP_LIMIT = 5;

// "/top" — this year's leaders; "/top 2025" — any past year.
export async function topCommand(ctx: Context): Promise<void> {
  const arg = ctx.match?.toString().trim();
  const year = arg ? Number(arg) : now().setZone(env.defaultTimezone).year;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    await ctx.reply("Использование: /top [год], например /top 2025. Без года — текущий.");
    return;
  }
  await ctx.reply(formatTop(year, await loadYearData(), TOP_LIMIT));
}
