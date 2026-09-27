export interface CachedPhoto {
  messageId: number;
  fileId: string;
  fileUniqueId: string;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_GROUPS = 500;

/**
 * Remembers photos of recent albums (media groups) seen in the group. A reply
 * to an album only carries the one photo replied to, so /photo looks the rest
 * up here. In-memory on purpose: after a restart older albums are simply
 * unknown and /photo falls back to the single replied-to photo.
 */
export class MediaGroupCache {
  private groups = new Map<string, { photos: CachedPhoto[]; expiresAt: number }>();

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly maxGroups = DEFAULT_MAX_GROUPS,
    private readonly now: () => number = Date.now,
  ) {}

  add(mediaGroupId: string, photo: CachedPhoto): void {
    this.evictExpired();
    const entry = this.groups.get(mediaGroupId);
    if (entry) {
      if (!entry.photos.some((p) => p.messageId === photo.messageId)) entry.photos.push(photo);
      return;
    }
    if (this.groups.size >= this.maxGroups) {
      const oldest = this.groups.keys().next().value;
      if (oldest !== undefined) this.groups.delete(oldest);
    }
    this.groups.set(mediaGroupId, { photos: [photo], expiresAt: this.now() + this.ttlMs });
  }

  // Photos of the album in message order; empty if unknown or expired.
  get(mediaGroupId: string): CachedPhoto[] {
    const entry = this.groups.get(mediaGroupId);
    if (!entry) return [];
    if (entry.expiresAt <= this.now()) {
      this.groups.delete(mediaGroupId);
      return [];
    }
    return [...entry.photos].sort((a, b) => a.messageId - b.messageId);
  }

  // Map keeps insertion order, which is also expiry order.
  private evictExpired(): void {
    const now = this.now();
    for (const [id, entry] of this.groups) {
      if (entry.expiresAt > now) break;
      this.groups.delete(id);
    }
  }
}

export const mediaGroupCache = new MediaGroupCache();
