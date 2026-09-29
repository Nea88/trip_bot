import { InlineKeyboard, type CallbackQueryContext, type Context, type NextFunction } from "grammy";
import { getGroupConfig } from "../services/groupConfig.js";
import { isAdminSender } from "../services/adminAuth.js";
import { NO_ADMINS_NOTE, notifyAdmins } from "../services/notifications.js";
import {
  addLink,
  deleteLink,
  findByRejectPrompt,
  findByUrl,
  getLink,
  getLinkBySeq,
  listApprovedLinks,
  reviewLink,
  setRejectPrompt,
} from "../services/links.js";
import { formatLinks, parseAddLink } from "../utils/links.js";
import { chunkLines } from "../utils/messageChunks.js";
import { escapeHtml } from "../utils/html.js";
import { formatUserName, mentionHtml } from "../utils/userName.js";
import type { LinkWithId } from "../types/index.js";

const CALLBACK_PREFIX = "lnk";
const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };
// A reject reason longer than this is cut — it goes into a chat message.
const MAX_REASON = 500;

export function linkReviewCallbackData(linkId: string, action: "approve" | "reject"): string {
  return `${CALLBACK_PREFIX}:${linkId}:${action}`;
}

export function linkReviewKeyboard(linkId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Одобрить", linkReviewCallbackData(linkId, "approve"))
    .text("Отклонить", linkReviewCallbackData(linkId, "reject"));
}

const linkHtml = (link: LinkWithId) => `<a href="${escapeHtml(link.url)}">${escapeHtml(link.description)}</a>`;

export function linkReviewText(link: LinkWithId): string {
  return `${formatUserName(link.addedByUsername, link.addedByHasUsername)} предлагает полезную ссылку #${link.seq}:\n${link.description}\n${link.url}`;
}

async function announceInGroup(ctx: Context, link: LinkWithId): Promise<void> {
  const config = await getGroupConfig();
  await ctx.api.sendMessage(config.groupChatId, `🔗 Новая полезная ссылка: ${linkHtml(link)}\nВсе ссылки — /links`, HTML);
}

export async function linksCommand(ctx: Context): Promise<void> {
  for (const chunk of chunkLines(formatLinks(await listApprovedLinks()))) {
    await ctx.reply(chunk, HTML);
  }
}

export async function addLinkCommand(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const parsed = parseAddLink(ctx.match?.toString() ?? "");
  if ("error" in parsed) {
    await ctx.reply(parsed.error);
    return;
  }

  const existing = await findByUrl(parsed.url);
  if (existing?.status === "approved") {
    await ctx.reply(`Эта ссылка уже есть в полезных: #${existing.seq} — /links`);
    return;
  }
  if (existing?.status === "pending") {
    await ctx.reply("Эта ссылка уже ждёт проверки админом.");
    return;
  }
  if (existing?.status === "rejected") {
    await ctx.reply(`Эту ссылку уже отклоняли${existing.rejectReason ? `: ${existing.rejectReason}` : "."}`);
    return;
  }

  const config = await getGroupConfig();
  const admin = await isAdminSender(ctx, config.groupChatId);
  const author = { userId: from.id, username: from.username ?? from.first_name, hasUsername: Boolean(from.username) };
  const link = await addLink(parsed.url, parsed.description, author, admin);

  if (admin) {
    if (ctx.chat?.id === config.groupChatId) {
      await ctx.reply(`🔗 Добавлено в полезные ссылки: ${linkHtml(link)}\nВсе ссылки — /links`, HTML);
    } else {
      await announceInGroup(ctx, link);
      await ctx.reply(`Добавлено: #${link.seq}. В группе опубликовано.`);
    }
    return;
  }

  const reached = await notifyAdmins(ctx.api, config.groupChatId, linkReviewText(link), linkReviewKeyboard(link.id));
  await ctx.reply(`Ссылка отправлена на проверку админу.${reached === 0 ? NO_ADMINS_NOTE : ""}`);
}

/**
 * Approve publishes the link. Reject asks the admin why — they answer by
 * replying to the bot's prompt (see rejectReasonHandler).
 */
export async function linkReviewCallback(ctx: CallbackQueryContext<Context>): Promise<void> {
  const [, linkId, action] = (ctx.callbackQuery.data ?? "").split(":");

  if (action === "approve") {
    const link = await reviewLink(linkId, "approved");
    if (!link) {
      await ctx.editMessageText("Эта ссылка уже обработана.");
    } else {
      await ctx.editMessageText(`Одобрено: #${link.seq} ${link.description}`);
      await announceInGroup(ctx, link);
    }
    await ctx.answerCallbackQuery();
    return;
  }

  const link = await getLink(linkId);
  if (!link || link.status !== "pending") {
    await ctx.editMessageText("Эта ссылка уже обработана.");
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.editMessageText(`Отклоняете #${link.seq} «${link.description}» — напишите причину в ответ на сообщение ниже.`);
  await ctx.answerCallbackQuery();
  const prompt = await ctx.reply(
    `Почему отклоняете «${link.description}»? Ответьте на это сообщение причиной — её получит автор. Или «-», чтобы без причины.`,
    { reply_markup: { force_reply: true, input_field_placeholder: "Причина отказа" } },
  );
  await setRejectPrompt(link.id, prompt.chat.id, prompt.message_id);
}

/**
 * An admin's reply to the "why are you rejecting?" prompt: rejects the link
 * and tells the author — in DM if the bot can write to them (they pressed
 * /start once), otherwise in the group with a mention.
 */
export async function rejectReasonHandler(ctx: Context, next: NextFunction): Promise<void> {
  const reply = ctx.message?.reply_to_message;
  const text = ctx.message?.text?.trim();
  if (!reply || !text || !ctx.chat || reply.from?.id !== ctx.me.id) return next();
  const link = await findByRejectPrompt(ctx.chat.id, reply.message_id);
  if (!link) return next();

  const config = await getGroupConfig();
  if (!(await isAdminSender(ctx, config.groupChatId))) return next();

  const reason = text === "-" ? null : text.slice(0, MAX_REASON);
  const rejected = await reviewLink(link.id, "rejected", reason);
  if (!rejected) {
    await ctx.reply("Эта ссылка уже обработана.");
    return;
  }

  const notice = `ссылку «${link.description}» не добавили в полезные${reason ? `. Причина: ${reason}` : "."}`;
  let where: string;
  try {
    await ctx.api.sendMessage(link.addedByUserId, `${notice[0].toUpperCase()}${notice.slice(1)}`);
    where = "в личные сообщения";
  } catch {
    await ctx.api.sendMessage(
      config.groupChatId,
      `${mentionHtml(link.addedByUserId, link.addedByUsername)}, ${escapeHtml(notice)}`,
      { parse_mode: "HTML" },
    );
    where = "в группе (в личку бот ему написать не может)";
  }
  await ctx.reply(`Отклонено. Автору сообщили ${where}.`);
}

export async function deleteLinkCommand(ctx: Context): Promise<void> {
  const arg = ctx.match?.toString().trim();
  const seq = Number(arg);
  if (!arg || !Number.isInteger(seq)) {
    await ctx.reply("Использование: /dellink <номер>. Номера — в /links.");
    return;
  }
  const link = await getLinkBySeq(seq);
  if (!link || link.status !== "approved") {
    await ctx.reply(`Ссылка #${seq} не найдена среди полезных.`);
    return;
  }
  await deleteLink(link.id);
  await ctx.reply(`Удалено: #${seq} ${link.description}`);
}

export const linkReviewCallbackPattern = new RegExp(`^${CALLBACK_PREFIX}:`);
