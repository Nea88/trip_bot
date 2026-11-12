import type { GeoPoint } from "./routeMap.js";

// A point typed or pasted by a person: "40.7512, 44.9596", degrees with
// minutes and seconds as Google shows them, or a Google / Yandex / OSM map
// link with the point in it. Short links (maps.app.goo.gl…) have no
// coordinates until followed — see services/coordinates.ts.

function valid(lat: number, lon: number): GeoPoint | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

const NUMBER = String.raw`-?\d{1,3}(?:\.\d+)?`;
const PAIR = new RegExp(String.raw`^(${NUMBER})\s*[,;\s]\s*(${NUMBER})$`);

function pair(text: string, lonFirst = false): GeoPoint | null {
  const m = PAIR.exec(text.trim());
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return lonFirst ? valid(b, a) : valid(a, b);
}

// 40°45'04.4"N 44°57'34.7"E
const DMS = /(\d{1,3})°\s*(?:(\d{1,2})['′]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)["″]\s*)?([NSСЮ])[\s,]*(\d{1,3})°\s*(?:(\d{1,2})['′]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)["″]\s*)?([EWВЗ])/i;

function dms(text: string): GeoPoint | null {
  const m = DMS.exec(text);
  if (!m) return null;
  const degrees = (d: string, mm?: string, s?: string) =>
    Number(d) + Number(mm ?? 0) / 60 + Number((s ?? "0").replace(",", ".")) / 3600;
  const lat = degrees(m[1], m[2], m[3]) * (/[SЮ]/i.test(m[4]) ? -1 : 1);
  const lon = degrees(m[5], m[6], m[7]) * (/[WЗ]/i.test(m[8]) ? -1 : 1);
  return valid(lat, lon);
}

function fromUrl(raw: string): GeoPoint | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname;
  const params = url.searchParams;
  const text = decodeURIComponent(url.href);

  // Yandex writes longitude first.
  if (/(^|\.)(yandex\.[a-z]+|ya\.ru)$/.test(host)) {
    for (const key of ["whatshere[point]", "pt", "ll"]) {
      const value = params.get(key);
      const point = value && pair(value.split("~")[0], true);
      if (point) return point;
    }
    return null;
  }

  if (/(^|\.)openstreetmap\.org$/.test(host)) {
    const marker = valid(Number(params.get("mlat")), Number(params.get("mlon")));
    if (params.has("mlat") && marker) return marker;
    const m = /#map=\d+\/(-?[\d.]+)\/(-?[\d.]+)/.exec(text);
    return m ? valid(Number(m[1]), Number(m[2])) : null;
  }

  // Google (and Apple, same order): the place's own pin beats the view centre.
  const pin = /!3d(-?[\d.]+)!4d(-?[\d.]+)/.exec(text);
  if (pin) return valid(Number(pin[1]), Number(pin[2]));
  for (const key of ["q", "query", "ll", "destination", "center", "daddr"]) {
    const value = params.get(key);
    const point = value && pair(value.replace(/\+/g, " "));
    if (point) return point;
  }
  const path = new RegExp(String.raw`/(?:search|place|dir)/(?:[^/]*/)?(${NUMBER}),\s*\+?(${NUMBER})`).exec(text);
  if (path) return valid(Number(path[1]), Number(path[2]));
  const view = new RegExp(String.raw`@(${NUMBER}),(${NUMBER})`).exec(text);
  return view ? valid(Number(view[1]), Number(view[2])) : null;
}

export function parseCoordinates(text: string): GeoPoint | null {
  const trimmed = text.trim();
  const url = /https?:\/\/\S+/.exec(trimmed)?.[0];
  if (url) return fromUrl(url);
  return pair(trimmed) ?? dms(trimmed);
}

// The first link in the text, if any.
export function findUrl(text: string): string | null {
  return /https?:\/\/\S+/.exec(text)?.[0] ?? null;
}
