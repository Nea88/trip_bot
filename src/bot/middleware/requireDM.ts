import type { Context, NextFunction } from "grammy";

export async function requireDM(ctx: Context, next: NextFunction): Promise<void> {
  if (ctx.chat?.type !== "private") {
    await ctx.reply("Напишите мне это в личные сообщения.");
    return;
  }
  await next();
}
