import type { Api, Context } from "grammy";
import { DateTime } from "luxon";
import { env } from "../config/env.js";
import { setClock } from "../utils/clock.js";
import { assertTelegramHtml } from "../utils/html.js";
import { resetGroupConfigCache } from "../services/groupConfig.js";
import { setWeatherFetcher } from "../services/weather.js";

// Every integration test runs at a fixed "now": Sunday 27.09.2026 12:00 in
// the group's timezone — the day polls auto-close and trips get confirmed.
export const NOW = DateTime.fromISO("2026-09-27T12:00", { zone: "Europe/Moscow" });
setClock(() => NOW);
// No network in tests: the forecast is "unavailable" unless a test stubs it.
setWeatherFetcher(async () => {
  throw new Error("no network in tests");
});

function checkHtml(text: unknown, extra: unknown): void {
  if ((extra as { parse_mode?: string } | undefined)?.parse_mode === "HTML") assertTelegramHtml(String(text));
}

export const GROUP_CHAT_ID = env.groupChatId;
export const ADMIN_ID = 1;
export const ADMIN_DM = 101;
export const USER_ID = 2;
// Group creator: an admin too, and the only one who gets backups.
export const OWNER_ID = 3;
export const OWNER_DM = 103;
export const BOT_ID = 42;

export interface ApiCall {
  method: string;
  args: unknown[];
}

/**
 * Fake Telegram API: records every call and answers with just enough for the
 * handlers. `voteCounts` is what stopPoll reports; ADMIN_ID and OWNER_ID
 * (the creator) are the admins.
 */
export function createFakeApi(options: { voteCounts?: number[]; unreachableChats?: number[] } = {}) {
  const calls: ApiCall[] = [];
  let nextMessageId = 1000;
  const handlers: Record<string, (...args: unknown[]) => unknown> = {
    getChatMember: (_chat, userId) => ({
      status: userId === OWNER_ID ? "creator" : userId === ADMIN_ID ? "administrator" : "member",
    }),
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
          // Telegram refuses to message users who never started the bot.
          if (method === "sendMessage" && options.unreachableChats?.includes(args[0] as number)) {
            throw new Error("Forbidden: bot can't initiate conversation with a user");
          }
          if (method === "sendMessage") checkHtml(args[1], args[2]);
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
  replyTo?: {
    message_id: number;
    media_group_id?: string;
    photo?: unknown[];
    location?: { latitude: number; longitude: number };
    venue?: { location: { latitude: number; longitude: number }; title: string; address: string };
  };
  callbackData?: string;
  username?: string;
  // Set for admins posting anonymously "as the group".
  senderChatId?: number;
  // Replaces the incoming message (e.g. an album photo for middleware).
  message?: Record<string, unknown>;
}

// A poll_answer update as Telegram sends it (empty optionIds = vote retracted).
export function pollAnswerCtx(telegramPollId: string, userId: number, optionIds: number[]): Context {
  return {
    pollAnswer: {
      poll_id: telegramPollId,
      user: { id: userId, is_bot: false, first_name: "Тест", username: `user${userId}` },
      option_ids: optionIds,
    },
  } as unknown as Context;
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
    senderChat: options.senderChatId ? { id: options.senderChatId, type: "supergroup" } : undefined,
    update: { update_id: 1 },
    me: { id: BOT_ID, is_bot: true, first_name: "Bot", username: "test_bot" },
    reply: async (text: string, extra?: unknown) => {
      checkHtml(text, extra);
      replies.push(text);
      replyExtras.push(extra);
      return { message_id: 900 + replies.length, chat: { id: chatId } };
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
