import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { env } from "../config/env.js";
import { requireAdmin } from "./middleware/requireAdmin.js";
import { requireGroupChat } from "./middleware/requireGroupChat.js";
import { requireDM } from "./middleware/requireDM.js";
import { suggestCommand } from "../commands/suggest.js";
import { listCommand } from "../commands/list.js";
import { editCommand } from "../commands/edit.js";
import { deleteCommand, deleteCallback, deleteCallbackPattern } from "../commands/deleteSuggestion.js";
import { createPollCommand } from "../commands/createPoll.js";
import { setCloseScheduleCommand, setScheduleCommand } from "../commands/setSchedule.js";
import { meetCommand } from "../commands/meet.js";
import { getScheduleCommand } from "../commands/getSchedule.js";
import { setReminderTimeCommand } from "../commands/setReminderTime.js";
import { setReminderTextCommand } from "../commands/setReminderText.js";
import { getReminderCommand } from "../commands/getReminder.js";
import { getOpenPollCommand } from "../commands/getOpenPoll.js";
import { closePollCommand, cancelPollCommand, closePollCallback, closePollCallbackPattern } from "../commands/closePoll.js";
import { restoreCommand } from "../commands/restore.js";
import { excludeCommand } from "../commands/exclude.js";
import { excludedCommand } from "../commands/excluded.js";
import { startCommand } from "../commands/start.js";
import { helpCommand } from "../commands/help.js";
import { reviewCallback, reviewCallbackPattern } from "../commands/reviewSuggestion.js";
import {
  photoCommand,
  photoReviewCallback,
  photoReviewCallbackPattern,
  unphotoCommand,
} from "../commands/photo.js";
import { placeCommand } from "../commands/place.js";
import { historyCommand } from "../commands/history.js";
import { rememberAlbumPhotos } from "./middleware/rememberAlbumPhotos.js";

export function createBot(): Bot {
  const bot = new Bot(env.botToken);

  // On 429 (flood limit) Telegram says how long to wait; retry after that
  // instead of failing the command. Capped so a long ban doesn't hang a
  // handler for minutes.
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }));

  bot.use(rememberAlbumPhotos);

  bot.command("start", requireDM, startCommand);
  bot.command("help", helpCommand);

  bot.command("suggest", requireGroupChat, suggestCommand);

  bot.command("list", requireGroupChat, listCommand);
  bot.command("photo", requireGroupChat, photoCommand);
  bot.command("place", requireGroupChat, placeCommand);
  bot.command("history", requireGroupChat, historyCommand);
  bot.command("unphoto", requireAdmin, requireGroupChat, unphotoCommand);
  bot.command("edit", requireAdmin, editCommand);
  bot.command("delete", requireAdmin, deleteCommand);
  bot.command("create_poll", requireAdmin, createPollCommand);
  bot.command("set_schedule", requireAdmin, setScheduleCommand);
  bot.command("set_close_schedule", requireAdmin, setCloseScheduleCommand);
  bot.command("meet", requireAdmin, meetCommand);
  bot.command("get_schedule", requireAdmin, getScheduleCommand);
  bot.command("set_reminder_time", requireAdmin, setReminderTimeCommand);
  bot.command("set_reminder_text", requireAdmin, setReminderTextCommand);
  bot.command("get_reminder", requireAdmin, getReminderCommand);
  bot.command("get_open_poll", requireAdmin, getOpenPollCommand);
  bot.command("close_poll", requireAdmin, requireGroupChat, closePollCommand);
  bot.command("cancel_poll", requireAdmin, requireGroupChat, cancelPollCommand);
  bot.command("restore", requireAdmin, restoreCommand);
  bot.command("exclude", requireAdmin, excludeCommand);
  bot.command("excluded", requireAdmin, excludedCommand);

  bot.callbackQuery(deleteCallbackPattern, requireAdmin, deleteCallback);
  bot.callbackQuery(closePollCallbackPattern, requireAdmin, closePollCallback);
  bot.callbackQuery(reviewCallbackPattern, requireAdmin, reviewCallback);
  bot.callbackQuery(photoReviewCallbackPattern, requireAdmin, photoReviewCallback);

  bot.catch(async (err) => {
    // Log only the cause: the BotError itself carries ctx.api, and printing it
    // dumps the bot token into the logs.
    console.error(`[bot] Unhandled error in update ${err.ctx.update.update_id}:`, err.error);
    try {
      await err.ctx.reply("Что-то пошло не так. Попробуйте ещё раз позже.");
    } catch {
      // Nowhere to reply (or Telegram is down) — the log above is enough.
    }
  });

  return bot;
}
