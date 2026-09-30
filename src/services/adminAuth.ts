import type { Api, Context } from "grammy";

const ADMIN_STATUSES = new Set(["creator", "administrator"]);
const CACHE_TTL_MS = 45_000;

const cache = new Map<number, { isAdmin: boolean; expiresAt: number }>();

export async function isGroupAdmin(
  api: Api,
  groupChatId: number,
  userId: number,
): Promise<boolean> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isAdmin;
  }

  let member;
  try {
    member = await api.getChatMember(groupChatId, userId);
  } catch (err) {
    // Throws for users who never joined the group (and on transient API
    // errors) — treat as non-admin, but don't cache so a blip isn't sticky.
    console.error(`[adminAuth] getChatMember failed for user ${userId}:`, err);
    return false;
  }
  const isAdmin = ADMIN_STATUSES.has(member.status);
  cache.set(userId, { isAdmin, expiresAt: Date.now() + CACHE_TTL_MS });
  return isAdmin;
}

/**
 * Whether the user created the group. Uncached: only backups ask, and they
 * carry every member's data, so a stale answer is worse than an extra call.
 */
export async function isGroupOwner(api: Api, groupChatId: number, userId: number): Promise<boolean> {
  try {
    return (await api.getChatMember(groupChatId, userId)).status === "creator";
  } catch (err) {
    console.error(`[adminAuth] getChatMember failed for user ${userId}:`, err);
    return false;
  }
}

/**
 * Whether the sender of this update is a group admin. Covers admins posting
 * anonymously "as the group": their messages carry sender_chat = the group
 * and a placeholder bot as `from`.
 */
export async function isAdminSender(ctx: Context, groupChatId: number): Promise<boolean> {
  if (ctx.senderChat?.id === groupChatId) return true;
  const userId = ctx.from?.id;
  return userId ? isGroupAdmin(ctx.api, groupChatId, userId) : false;
}
