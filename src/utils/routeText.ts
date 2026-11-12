// The points a place's text names, for geocoding, in route order:
// "Ереван — Севан — Дилижан" → start, via point, finish. Without a separator
// the whole text is one point.

// Spaced dashes only, so names like "Ай-Петри" stay whole.
const SEPARATOR = /\s+[—–-]\s+|\s*(?:→|->|\/)\s*/;

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
