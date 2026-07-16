import { Bot } from "grammy";
import { env } from "../config/env.js";
import { requireAdmin } from "./middleware/requireAdmin.js";
import { requireGroupChat } from "./middleware/requireGroupChat.js";
import { requireDM } from "./middleware/requireDM.js";
import { suggestCommand } from "../commands/suggest.js";
import { listCommand } from "../commands/list.js";
import { editCommand } from "../commands/edit.js";
import { deleteCommand, deleteCallback, deleteCallbackPattern } from "../commands/deleteSuggestion.js";
import { createPollCommand } from "../commands/createPoll.js";
import { setScheduleCommand } from "../commands/setSchedule.js";
import { closePollCommand, closePollCallback, closePollCallbackPattern } from "../commands/closePoll.js";
import { restoreCommand } from "../commands/restore.js";
import { excludedCommand } from "../commands/excluded.js";
import { startCommand } from "../commands/start.js";

export function createBot(): Bot {
  const bot = new Bot(env.botToken);

  bot.command("start", requireDM, startCommand);

  bot.command("suggest", requireGroupChat, suggestCommand);

  bot.command("list", requireAdmin, listCommand);
  bot.command("edit", requireAdmin, editCommand);
  bot.command("delete", requireAdmin, deleteCommand);
  bot.command("create_poll", requireAdmin, createPollCommand);
  bot.command("set_schedule", requireAdmin, setScheduleCommand);
  bot.command("close_poll", requireAdmin, requireGroupChat, closePollCommand);
  bot.command("restore", requireAdmin, restoreCommand);
  bot.command("excluded", requireAdmin, excludedCommand);

  bot.callbackQuery(deleteCallbackPattern, requireAdmin, deleteCallback);
  bot.callbackQuery(closePollCallbackPattern, requireAdmin, closePollCallback);

  bot.catch((err) => {
    console.error("[bot] Unhandled error:", err);
  });

  return bot;
}
