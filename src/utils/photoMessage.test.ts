import { test } from "node:test";
import assert from "node:assert/strict";
import type { Api } from "grammy";
import type { PhotoSize } from "grammy/types";
import {
  buildMessageLink,
  chunk,
  describeItems,
  largestPhoto,
  photoBadge,
  sendPlaceItems,
} from "./photoMessage.js";

const size = (id: string, width: number): PhotoSize => ({
  file_id: id,
  file_unique_id: `u${id}`,
  width,
  height: width,
});

test("largestPhoto picks the last (biggest) size", () => {
  assert.equal(largestPhoto({ photo: [size("s", 90), size("m", 320), size("l", 1280)] })?.file_id, "l");
});

test("largestPhoto returns null without a photo", () => {
  assert.equal(largestPhoto({}), null);
  assert.equal(largestPhoto({ photo: [] }), null);
});

test("buildMessageLink strips the supergroup -100 prefix", () => {
  assert.equal(buildMessageLink(-1001234567890, 42), "https://t.me/c/1234567890/42");
});

test("chunk splits into groups of the given size", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 10), []);
});

test("photoBadge only shows for a positive count", () => {
  assert.equal(photoBadge(undefined), "");
  assert.equal(photoBadge(0), "");
  assert.equal(photoBadge(7), " 📷 7");
});

test("describeItems counts photos and other messages", () => {
  assert.equal(describeItems([{ fileId: "a" }, { fileId: "b" }]), "2 фото");
  assert.equal(describeItems([{ fileId: null }]), "1 сообщение");
  assert.equal(describeItems([{ fileId: "a" }, { fileId: null }, { fileId: null }]), "1 фото и 2 сообщения");
});

test("sendPlaceItems sends photos as albums and copies other messages, counting failures", async () => {
  const calls: string[] = [];
  const api = {
    sendPhoto: async (_chat: number, fileId: string) => calls.push(`photo:${fileId}`),
    sendMediaGroup: async (_chat: number, media: { media: string }[]) =>
      calls.push(`album:${media.map((m) => m.media).join(",")}`),
    copyMessage: async (_chat: number, _from: number, messageId: number) => {
      if (messageId === 2) throw new Error("message to copy not found");
      calls.push(`copy:${messageId}`);
    },
  } as unknown as Api;

  const failed = await sendPlaceItems(api, 1, [
    { fileId: "a", sourceChatId: -1, sourceMessageId: 10 },
    { fileId: null, sourceChatId: -1, sourceMessageId: 2 },
    { fileId: "b", sourceChatId: -1, sourceMessageId: 11 },
    { fileId: null, sourceChatId: -1, sourceMessageId: 3 },
  ]);

  assert.equal(failed, 1);
  assert.deepEqual(calls, ["album:a,b", "copy:3"]);
});

test("sendPlaceItems sends a lone photo as a plain photo", async () => {
  const calls: string[] = [];
  const api = {
    sendPhoto: async (_chat: number, fileId: string) => calls.push(`photo:${fileId}`),
  } as unknown as Api;
  assert.equal(await sendPlaceItems(api, 1, [{ fileId: "a", sourceChatId: -1, sourceMessageId: 1 }]), 0);
  assert.deepEqual(calls, ["photo:a"]);
});
