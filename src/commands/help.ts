import type { Context } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { isGroupAdmin } from "../services/adminAuth.js";

const USER_HELP_TEXT = `Команды:
/suggest <куда> — предложить вариант маршрута (в группе). Уходит на рассмотрение админу, появится в списке после одобрения
/list — посмотреть текущие (уже одобренные) варианты (в группе)
/start — в личных сообщениях боту, чтобы получать уведомления о новых предложениях (актуально для админов)
/help — этот список`;

const ADMIN_HELP_TEXT = `${USER_HELP_TEXT}

Команды для админов группы:
Одобрение/отклонение новых предложений — кнопками прямо в DM-уведомлении, отдельной команды нет
/edit <номер> <текст> — изменить текст варианта
/delete <номер> — удалить вариант навсегда
/restore <номер> — вернуть исключённый вариант в пул
/excluded — список исключённых (использованных) вариантов
/create_poll — создать опрос прямо сейчас
/close_poll — закрыть текущий опрос и зафиксировать победителя
/set_schedule <день> <ЧЧ:ММ> <таймзона> — расписание автосоздания опроса
/get_schedule — посмотреть текущее расписание автосоздания опроса
/set_reminder_time <ЧЧ:ММ> <таймзона> — время памятки про /suggest (приходит через день)
/set_reminder_text <текст> — свой текст для памятки
/get_reminder — посмотреть текущее время и текст памятки`;

export async function helpCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply(USER_HELP_TEXT);
    return;
  }

  const config = await getGroupConfig();
  const admin = await isGroupAdmin(ctx.api, config.groupChatId, userId);
  await ctx.reply(admin ? ADMIN_HELP_TEXT : USER_HELP_TEXT);
}
