import type { Api } from "grammy";

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
