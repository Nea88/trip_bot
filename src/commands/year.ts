import type { Context } from "grammy";
import { buildYearSummary } from "../services/yearSummary.js";
import { env } from "../config/env.js";
import { now } from "../utils/clock.js";

// "/year" — this year so far; "/year 2025" — any past year.
export async function yearCommand(ctx: Context): Promise<void> {
  const arg = ctx.match?.toString().trim();
  const year = arg ? Number(arg) : now().setZone(env.defaultTimezone).year;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    await ctx.reply("Использование: /year [год], например /year 2025. Без года — текущий.");
    return;
  }
  await ctx.reply(await buildYearSummary(year));
}
