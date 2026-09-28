import { Bot, type BotError, type Context, type Middleware } from "grammy";
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
import { COMMANDS, type CommandName } from "./commandSpecs.js";

// Exhaustive: adding a command to COMMANDS without a handler fails to compile.
const HANDLERS: Record<CommandName, (ctx: Context) => Promise<void>> = {
  suggest: suggestCommand,
  list: listCommand,
  photo: photoCommand,
  place: placeCommand,
  history: historyCommand,
  start: startCommand,
  help: helpCommand,
  unphoto: unphotoCommand,
  edit: editCommand,
  delete: deleteCommand,
  exclude: excludeCommand,
  restore: restoreCommand,
  excluded: excludedCommand,
  create_poll: createPollCommand,
  meet: meetCommand,
  close_poll: closePollCommand,
  cancel_poll: cancelPollCommand,
  get_open_poll: getOpenPollCommand,
  set_schedule: setScheduleCommand,
  set_close_schedule: setCloseScheduleCommand,
  get_schedule: getScheduleCommand,
  set_reminder_time: setReminderTimeCommand,
  set_reminder_text: setReminderTextCommand,
  get_reminder: getReminderCommand,
};

export function createBot(): Bot {
  const bot = new Bot(env.botToken);

  // On 429 (flood limit) Telegram says how long to wait; retry after that
  // instead of failing the command. Capped so a long ban doesn't hang a
  // handler for minutes.
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }));

  bot.use(rememberAlbumPhotos);

  for (const spec of COMMANDS) {
    const guards: Middleware[] = [];
    if (spec.audience === "admin") guards.push(requireAdmin);
    if (spec.where === "group") guards.push(requireGroupChat);
    if (spec.where === "dm") guards.push(requireDM);
    bot.command(spec.command, ...guards, HANDLERS[spec.command]);
  }

  bot.callbackQuery(deleteCallbackPattern, requireAdmin, deleteCallback);
  bot.callbackQuery(closePollCallbackPattern, requireAdmin, closePollCallback);
  bot.callbackQuery(reviewCallbackPattern, requireAdmin, reviewCallback);
  bot.callbackQuery(photoReviewCallbackPattern, requireAdmin, photoReviewCallback);

  bot.catch(handleBotError);

  return bot;
}

const ERROR_TEXT = "Что-то пошло не так. Попробуйте ещё раз позже.";

export async function handleBotError(err: BotError): Promise<void> {
  // Log only the cause: the BotError itself carries ctx.api, and printing it
  // dumps the bot token into the logs.
  console.error(`[bot] Unhandled error in update ${err.ctx.update.update_id}:`, err.error);
  try {
    // A button press must be answered, or its spinner keeps going for ~15s.
    if (err.ctx.callbackQuery) {
      await err.ctx.answerCallbackQuery({ text: ERROR_TEXT });
    } else {
      await err.ctx.reply(ERROR_TEXT);
    }
  } catch {
    // Nowhere to reply (or Telegram is down) — the log above is enough.
  }
}
