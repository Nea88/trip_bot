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

  const member = await api.getChatMember(groupChatId, userId);
  const isAdmin = ADMIN_STATUSES.has(member.status);
  cache.set(userId, { isAdmin, expiresAt: Date.now() + CACHE_TTL_MS });
  return isAdmin;
}
