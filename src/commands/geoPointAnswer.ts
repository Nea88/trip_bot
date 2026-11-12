import type { Context, NextFunction } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { isGroupOwner } from "../services/adminAuth.js";
import { deleteGeoPrompt, findGeoPromptByMessage, setGeoPoint } from "../services/geoPoints.js";
import { GEO_PROMPT_HINT, refreshRouteMap } from "../services/routeMap.js";
import { resolveCoordinates } from "../services/coordinates.js";

/**
 * The owner's reply to "where is <name>?": coordinates or a map link. The
 * point is saved for that name (every place mentioning it gets it) and the
 * open poll's map is redrawn. Passes on any other text.
 */
export async function geoPointAnswerHandler(ctx: Context, next: NextFunction): Promise<void> {
  const reply = ctx.message?.reply_to_message;
  const text = ctx.message?.text?.trim();
  if (!reply || !text || !ctx.chat || !ctx.from || reply.from?.id !== ctx.me.id) return next();
  const prompt = await findGeoPromptByMessage(ctx.chat.id, reply.message_id);
  if (!prompt) return next();

  const config = await getGroupConfig();
  if (!(await isGroupOwner(ctx.api, config.groupChatId, ctx.from.id))) return next();

  const point = await resolveCoordinates(text);
  if (!point) {
    await ctx.reply(`Не понял, где это. ${GEO_PROMPT_HINT}`, {
      reply_parameters: { message_id: reply.message_id },
    });
    return;
  }

  await setGeoPoint(prompt.name, point, ctx.from.id);
  await deleteGeoPrompt(prompt.name);
  const refreshed = await refreshRouteMap(ctx.api, config.groupChatId);
  await ctx.reply(
    `📍 Запомнил «${prompt.name}»: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}.` +
      (refreshed ? " Карта к опросу обновлена." : ""),
  );
}
