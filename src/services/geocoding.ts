import type { RouteGeo, SuggestionWithId } from "../types/index.js";
import type { GeoPoint } from "../utils/routeMap.js";
import { geocodeQueries, splitRoute } from "../utils/routeText.js";
import { setRouteGeo } from "./suggestions.js";
import { getGeoPoint } from "./geoPoints.js";
import { OSM_USER_AGENT } from "../constants.js";

type Fetcher = (url: string) => Promise<Response>;

// Nominatim's usage policy: at most one request per second.
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;

async function politeFetch(url: string): Promise<Response> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  return fetch(url, { headers: { "User-Agent": OSM_USER_AGENT }, signal: AbortSignal.timeout(5000) });
}

// Replaceable for tests, which must never reach the network.
let fetcher: Fetcher = politeFetch;

export function setGeocodeFetcher(fn: Fetcher): void {
  fetcher = fn;
}

/**
 * Where a name is on the map (OpenStreetMap's Nominatim, free, no key; the
 * group rides in Armenia). null = nothing found; throws when the service
 * can't be reached, so a temporary failure isn't remembered as "not found".
 */
export async function geocode(name: string): Promise<GeoPoint | null> {
  for (const query of geocodeQueries(name)) {
    const point = await search(query);
    if (point) return point;
  }
  return null;
}

async function search(name: string): Promise<GeoPoint | null> {
  const params = new URLSearchParams({
    q: name,
    format: "jsonv2",
    limit: "1",
    "accept-language": "ru",
    countrycodes: "am",
  });
  const res = await fetcher(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  if (!hit) return null;
  const point = { lat: Number(hit.lat), lon: Number(hit.lon) };
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) ? point : null;
}

// The owner's point beats the geocoder: it was given because the geocoder failed.
async function locate(name: string): Promise<GeoPoint | null> {
  return (await getGeoPoint(name)) ?? (await geocode(name));
}

/**
 * The points of a place's route, from its text. Saved on the place, so each
 * text is geocoded once; /edit changes the text and it is looked up again.
 * Points still missing are checked against the ones the owner gave since.
 * When the geocoder is down the result has no points, isn't saved and is
 * marked unavailable — nobody should be asked about those names.
 */
export async function resolveRouteGeo(suggestion: SuggestionWithId): Promise<RouteGeo & { unavailable?: boolean }> {
  const cached = suggestion.routeGeo;
  if (cached?.sourceText === suggestion.text && Array.isArray(cached.points)) {
    if (cached.points.every(Boolean)) return cached;
    const points = await Promise.all(cached.points.map(async (p, i) => p ?? (await getGeoPoint(cached.names[i]))));
    if (points.some((p, i) => p && !cached.points[i])) {
      const updated = { ...cached, points };
      await setRouteGeo(suggestion.id, updated);
      return updated;
    }
    return cached;
  }

  const names = splitRoute(suggestion.text);
  try {
    const points: (GeoPoint | null)[] = [];
    for (const name of names) points.push(await locate(name));
    const routeGeo: RouteGeo = { sourceText: suggestion.text, names, points };
    await setRouteGeo(suggestion.id, routeGeo);
    return routeGeo;
  } catch (err) {
    console.error(`[geocoding] "${suggestion.text}" not looked up:`, err instanceof Error ? err.message : err);
    return { sourceText: suggestion.text, names, points: names.map(() => null), unavailable: true };
  }
}
