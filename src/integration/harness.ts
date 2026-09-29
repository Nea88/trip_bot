import type { Api, Context } from "grammy";
import { DateTime } from "luxon";
import { env } from "../config/env.js";
import { setClock } from "../utils/clock.js";
import { resetGroupConfigCache } from "../services/groupConfig.js";

// Every integration test runs at a fixed "now": Sunday 27.09.2026 12:00 in
// the group's timezone — the day polls auto-close and trips get confirmed.
export const NOW = DateTime.fromISO("2026-09-27T12:00", { zone: "Europe/Moscow" });
setClock(() => NOW);

export const GROUP_CHAT_ID = env.groupChatId;
export const ADMIN_ID = 1;
export const ADMIN_DM = 101;
export const USER_ID = 2;

export interface ApiCall {
  method: string;
  args: unknown[];
}

/**
 * Fake Telegram API: records every call and answers with just enough for the
 * handlers. `voteCounts` is what stopPoll reports; ADMIN_ID is the only admin.
 */
export function createFakeApi(options: { voteCounts?: number[] } = {}) {
  const calls: ApiCall[] = [];
  let nextMessageId = 1000;
  const handlers: Record<string, (...args: unknown[]) => unknown> = {
    getChatMember: (_chat, userId) => ({ status: userId === ADMIN_ID ? "administrator" : "member" }),
    sendPoll: () => ({ message_id: nextMessageId++, poll: { id: `tg-poll-${nextMessageId}` } }),
    stopPoll: () => ({
      options: (options.voteCounts ?? []).map((voter_count) => ({ voter_count })),
    }),
    sendMediaGroup: (_chat, media) => (media as unknown[]).map(() => ({ message_id: nextMessageId++ })),
  };
  const api = new Proxy(
    {},
    {
      get: (_target, method: string) =>
        async (...args: unknown[]) => {
          calls.push({ method, args });
          const handler = handlers[method];
          return handler ? handler(...args) : { message_id: nextMessageId++ };
        },
    },
  ) as unknown as Api;
  const callsTo = (method: string) => calls.filter((c) => c.method === method);
  return { api, calls, callsTo };
}

export interface FakeCtxOptions {
  userId: number;
  chatId?: number;
  match?: string;
  replyTo?: { message_id: number; media_group_id?: string; photo?: unknown[] };
  callbackData?: string;
  username?: string;
  // Replaces the incoming message (e.g. an album photo for middleware).
  message?: Record<string, unknown>;
}

// The subset of grammY's Context the handlers use, with replies captured.
export function createFakeCtx(api: Api, options: FakeCtxOptions) {
  const replies: string[] = [];
  // Second argument of each reply (keyboards etc.), aligned with `replies`.
  const replyExtras: unknown[] = [];
  const edits: string[] = [];
  const callbackAnswers: (string | undefined)[] = [];
  const documents: { document: unknown; caption?: string }[] = [];
  const chatId = options.chatId ?? GROUP_CHAT_ID;
  const ctx = {
    api,
    match: options.match ?? "",
    chat: { id: chatId, type: chatId < 0 ? "supergroup" : "private" },
    from: { id: options.userId, is_bot: false, first_name: "Тест", username: options.username ?? `user${options.userId}` },
    message: options.message ?? { message_id: 1, reply_to_message: options.replyTo },
    callbackQuery: options.callbackData ? { data: options.callbackData } : undefined,
    update: { update_id: 1 },
    reply: async (text: string, extra?: unknown) => {
      replies.push(text);
      replyExtras.push(extra);
      return { message_id: 1 };
    },
    editMessageText: async (text: string) => {
      edits.push(text);
      return true;
    },
    replyWithDocument: async (document: unknown, extra?: { caption?: string }) => {
      documents.push({ document, caption: extra?.caption });
      return { message_id: 1 };
    },
    answerCallbackQuery: async (answer?: { text?: string }) => {
      callbackAnswers.push(answer?.text);
      return true;
    },
  };
  return {
    ctx: ctx as unknown as Context,
    replies,
    replyExtras,
    edits,
    callbackAnswers,
    documents,
    lastReply: () => replies.at(-1) ?? "",
  };
}

// Wipes every document in the emulator between tests.
export async function clearFirestore(): Promise<void> {
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${env.firebaseProjectId}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to clear Firestore emulator: ${res.status}`);
  resetGroupConfigCache();
}

export const photoSizes = (id: string) => [
  { file_id: `small-${id}`, file_unique_id: `usmall-${id}`, width: 90, height: 90 },
  { file_id: id, file_unique_id: `u-${id}`, width: 1280, height: 1280 },
];
