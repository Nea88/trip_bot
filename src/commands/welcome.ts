import type { Context } from "grammy";
import { getGroupConfig, setWelcomeText } from "../services/groupConfig.js";
import { DEFAULT_WELCOME_TEXT } from "../constants.js";
import { escapeHtml } from "../utils/html.js";
import { mentionHtml } from "../utils/userName.js";

// Greets people who join the group with what the bot does and where the links are.
export async function welcomeNewMembers(ctx: Context): Promise<void> {
  const members = (ctx.message?.new_chat_members ?? []).filter((m) => !m.is_bot);
  const config = await getGroupConfig();
  if (members.length === 0 || ctx.chat?.id !== config.groupChatId) return;

  const names = members.map((m) => mentionHtml(m.id, m.first_name)).join(", ");
  await ctx.reply(`👋 Добро пожаловать, ${names}!\n\n${escapeHtml(config.welcomeText ?? DEFAULT_WELCOME_TEXT)}`, {
    parse_mode: "HTML",
  });
}

const USAGE =
  "Использование: /set_welcome_text <текст> — свой текст приветствия новых участников (после строки «👋 Добро пожаловать, …!»). /set_welcome_text - — вернуть текст по умолчанию.";

export async function setWelcomeTextCommand(ctx: Context): Promise<void> {
  const text = ctx.match?.toString().trim();
  if (!text) {
    const config = await getGroupConfig();
    const current = config.welcomeText ? "свой" : "по умолчанию";
    await ctx.reply(`${USAGE}\n\nСейчас (${current}):\n${config.welcomeText ?? DEFAULT_WELCOME_TEXT}`);
    return;
  }
  if (text === "-") {
    await setWelcomeText(null);
    await ctx.reply("Приветствие — снова текст по умолчанию.");
    return;
  }
  await setWelcomeText(text);
  await ctx.reply(`Текст приветствия обновлён:\n\n${text}`);
}
