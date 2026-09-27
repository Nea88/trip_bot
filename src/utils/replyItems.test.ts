import { test } from "node:test";
import assert from "node:assert/strict";
import type { PhotoSize } from "grammy/types";
import { MediaGroupCache } from "../services/mediaGroupCache.js";
import { collectReplyItems, placeItemKey } from "./replyItems.js";

const CHAT = -1001;
const photo = (id: string): PhotoSize[] => [
  { file_id: `small-${id}`, file_unique_id: `usmall-${id}`, width: 90, height: 90 },
  { file_id: id, file_unique_id: `u-${id}`, width: 1280, height: 1280 },
];

test("a single photo is taken by its largest file", () => {
  const result = collectReplyItems({ message_id: 5, photo: photo("p") }, CHAT, new MediaGroupCache());
  assert.deepEqual(result, {
    items: [{ fileId: "p", fileUniqueId: "u-p", sourceChatId: CHAT, sourceMessageId: 5 }],
    albumIncomplete: false,
  });
});

test("a message without a photo is taken by reference", () => {
  const result = collectReplyItems({ message_id: 7 }, CHAT, new MediaGroupCache());
  assert.deepEqual(result, {
    items: [{ fileId: null, fileUniqueId: null, sourceChatId: CHAT, sourceMessageId: 7 }],
    albumIncomplete: false,
  });
});

test("a video in an album is still a single message, not an incomplete album", () => {
  const result = collectReplyItems({ message_id: 8, media_group_id: "g" }, CHAT, new MediaGroupCache());
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].fileId, null);
  assert.equal(result.albumIncomplete, false);
});

test("a photo from a remembered album takes the whole album", () => {
  const albums = new MediaGroupCache();
  albums.add("g", { messageId: 10, fileId: "a", fileUniqueId: "ua" });
  albums.add("g", { messageId: 11, fileId: "b", fileUniqueId: "ub" });
  const result = collectReplyItems({ message_id: 11, media_group_id: "g", photo: photo("b") }, CHAT, albums);
  assert.deepEqual(result.items.map((i) => [i.fileId, i.sourceMessageId]), [["a", 10], ["b", 11]]);
  assert.equal(result.albumIncomplete, false);
});

test("a photo from an unknown album falls back to just that photo", () => {
  const result = collectReplyItems(
    { message_id: 12, media_group_id: "g", photo: photo("c") },
    CHAT,
    new MediaGroupCache(),
  );
  assert.deepEqual(result.items.map((i) => i.fileId), ["c"]);
  assert.equal(result.albumIncomplete, true);
});

test("placeItemKey uses the file for photos and the source for messages", () => {
  assert.equal(placeItemKey({ fileUniqueId: "u1", sourceChatId: CHAT, sourceMessageId: 1 }), "u1");
  assert.equal(
    placeItemKey({ fileUniqueId: null, sourceChatId: CHAT, sourceMessageId: 1 }),
    `msg:${CHAT}:1`,
  );
});
