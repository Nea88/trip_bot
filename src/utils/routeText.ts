// The points a place's text names, for geocoding, in route order:
// "Ереван — Севан — Дилижан" → start, via point, finish. Without a separator
// the whole text is one point.

// Any dash, spaced or not ("Семёновка-Гош" too), and arrows typed any way:
// "->", "-->", "–>", "=>", "→". Hyphen-like characters phones and Word put in
// are dashes too. A hyphenated name ("Ай-Петри") splits as well — the group's
// places are in Armenia, where that's rare.
const DASHES = "\\-\u2010\u2011\u2012\u2013\u2014\u2015\u2212";
const SEPARATOR = new RegExp(`\\s*(?:[${DASHES}=]*[>\u2192\u27f6\u279d\u2794\u21d2]|[${DASHES}]+|\\/)\\s*`);

function clean(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/["«»“”„]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitRoute(text: string): string[] {
  return text.split(SEPARATOR).map(clean).filter(Boolean);
}

/**
 * Whether saved points still match the place: same text, split the same way
 * (the separators were widened in 1.23.2, so "Семёновка-Гош" saved as one
 * point is redone), and in the current format.
 */
export function routeGeoFresh(text: string, geo: { sourceText: string; names?: string[]; points?: unknown } | undefined): boolean {
  if (!geo || geo.sourceText !== text || !Array.isArray(geo.points) || !Array.isArray(geo.names)) return false;
  const names = splitRoute(text);
  return names.length === geo.names.length && names.every((n, i) => n === geo.names![i]);
}

export type PointKind = "start" | "via" | "finish";

// A one-point place is drawn as a start.
export function pointKind(index: number, count: number): PointKind {
  if (index === 0) return "start";
  return index === count - 1 ? "finish" : "via";
}

// One key per name, so "Семёновка" and "семеновка" share a clarified point.
export function normalizePlaceName(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

// Words OSM usually leaves out of the name: "озеро Парз" is just "Парз".
const GENERIC_WORDS =
  /(?<![\p{L}\d-])(?:оз\.|озеро|гора|г\.|с\.|село|деревня|перевал|водопад|монастырь|каньон|ущелье|крепость|пещера|река|р\.)(?![\p{L}\d-])/giu;

// What to ask the geocoder for a name, best guess first.
export function geocodeQueries(name: string): string[] {
  const bare = name.replace(GENERIC_WORDS, " ").replace(/\s+/g, " ").trim();
  return bare && bare !== name ? [name, bare] : [name];
}
