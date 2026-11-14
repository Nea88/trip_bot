import type { GeoPoint } from "../utils/routeMap.js";
import { normalizePlaceName } from "../utils/routeText.js";
import { deleteGeoPoint, deleteGeoPrompt, setGeoPoint, type PointAuthor } from "./geoPoints.js";
import { geocode } from "./geocoding.js";
import { listAllSuggestions, setRouteGeo } from "./suggestions.js";

/**
 * Puts the point into every place whose route mentions the name; returns
 * how many places changed.
 */
async function applyToPlaces(name: string, point: GeoPoint | null): Promise<number> {
  const key = normalizePlaceName(name);
  let changed = 0;
  for (const place of await listAllSuggestions()) {
    const geo = place.routeGeo;
    if (!geo || !Array.isArray(geo.points)) continue;
    const hits = geo.names.map((n, i) => (normalizePlaceName(n) === key ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 0) continue;
    const points = [...geo.points];
    for (const i of hits) points[i] = point;
    await setRouteGeo(place.id, { ...geo, points });
    changed++;
  }
  return changed;
}

/**
 * A point given by hand for a name: remembered for good (beats the
 * geocoder), put into every place that mentions the name, and the owner is
 * no longer asked about it.
 */
export async function setPointForName(name: string, point: GeoPoint, by: PointAuthor): Promise<number> {
  await setGeoPoint(name, point, by);
  await deleteGeoPrompt(name);
  return applyToPlaces(name, point);
}

export type ResetResult = { kind: "found"; point: GeoPoint } | { kind: "not_found" } | { kind: "unavailable" };

/**
 * Forgets the hand-given point and looks the name up again. While the
 * geocoder is down nothing changes.
 */
export async function resetPointForName(name: string): Promise<ResetResult> {
  let point: GeoPoint | null;
  try {
    point = await geocode(name);
  } catch (err) {
    console.error(`[pointEdits] "${name}" not looked up:`, err instanceof Error ? err.message : err);
    return { kind: "unavailable" };
  }
  await deleteGeoPoint(name);
  await applyToPlaces(name, point);
  return point ? { kind: "found", point } : { kind: "not_found" };
}
