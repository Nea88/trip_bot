import { findUrl, parseCoordinates } from "../utils/coordinates.js";
import type { GeoPoint } from "../utils/routeMap.js";

type Fetcher = (url: string) => Promise<Response>;

let fetcher: Fetcher = (url) => fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5000) });

// Replaceable for tests, which must never reach the network.
export function setShortLinkFetcher(fn: Fetcher): void {
  fetcher = fn;
}

// Only map services' short links are followed — no fetching arbitrary pages.
const SHORT_LINK_HOSTS = /(^|\.)(goo\.gl|google\.[a-z.]+|yandex\.[a-z]+|ya\.ru|ya\.cc|osm\.org)$/;

/**
 * A point from coordinates or a map link; a short link (maps.app.goo.gl,
 * yandex.ru/maps/-/…) is followed to the full one, which has the point.
 */
export async function resolveCoordinates(text: string): Promise<GeoPoint | null> {
  const direct = parseCoordinates(text);
  if (direct) return direct;
  const url = findUrl(text);
  if (!url) return null;
  try {
    if (!SHORT_LINK_HOSTS.test(new URL(url).hostname)) return null;
    const res = await fetcher(url);
    return parseCoordinates(res.url);
  } catch (err) {
    console.error("[coordinates] Short link not followed:", err instanceof Error ? err.message : err);
    return null;
  }
}
