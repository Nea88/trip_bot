import type { Context } from "grammy";
import {
  addSuggestion,
  findByNormalizedText,
  normalizeSuggestionText,
} from "../services/suggestions.js";
import { notifyAdmins } from "../services/notifications.js";
import { getGroupConfig } from "../services/groupConfig.js";

// Telegram poll option text is capped at 100 characters; suggestions become
// poll options, so this must be enforced before a suggestion is ever accepted.
const MAX_SUGGESTION_LENGTH = 100;

export async function suggestCommand(ctx: Context): Promise<void> {
  const text = ctx.match?.toString().trim();
  if (!text) {
    await ctx.reply("Использование: /suggest <куда поехать>");
    return;
  }
  if (text.length > MAX_SUGGESTION_LENGTH) {
    await ctx.reply(
      `Слишком длинно (максимум ${MAX_SUGGESTION_LENGTH} символов) — сократите текст.`,
    );
    return;
  }

  const existing = await findByNormalizedText(normalizeSuggestionText(text));
  if (existing) {
    if (existing.status === "active") {
      await ctx.reply(`Такой вариант уже есть в списке: #${existing.seq}`);
    } else {
      await ctx.reply(
        `Это место уже предлагали и оно исключено (#${existing.seq}). Попросите админа вернуть его командой /restore ${existing.seq}, вместо того чтобы добавлять заново.`,
      );
    }
    return;
  }

  const userId = ctx.from!.id;
  const username = ctx.from!.username ?? ctx.from!.first_name ?? "кто-то";

  const suggestion = await addSuggestion(text, userId, username);
  await ctx.reply(`Добавлено предложение #${suggestion.seq}: ${text}`);

  const config = await getGroupConfig();
  await notifyAdmins(
    ctx.api,
    config.groupChatId,
    `Новое предложение маршрута от @${username}:\n#${suggestion.seq}: ${text}`,
  );
}
