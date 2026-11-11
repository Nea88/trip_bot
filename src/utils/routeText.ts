// What a place's text says about where the route starts and ends, for
// geocoding: "Семёновка — Гош" → start "Семёновка", finish "Гош". Without a
// separator the whole text is one point (drawn as a start only).
export interface RouteNames {
  start: string;
  finish: string | null;
}

// Spaced dashes only, so names like "Ай-Петри" stay whole.
const SEPARATOR = /\s+[—–-]\s+|\s*(?:→|->|\/)\s*/;

function clean(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/["«»“”„]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitRoute(text: string): RouteNames | null {
  const parts = text.split(SEPARATOR).map(clean).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return { start: parts[0], finish: null };
  return { start: parts[0], finish: parts.at(-1)! };
}

// Words OSM usually leaves out of the name: "озеро Парз" is just "Парз".
const GENERIC_WORDS =
  /(?<![\p{L}\d-])(?:оз\.|озеро|гора|г\.|с\.|село|деревня|перевал|водопад|монастырь|каньон|ущелье|крепость|пещера|река|р\.)(?![\p{L}\d-])/giu;

// What to ask the geocoder for a name, best guess first.
export function geocodeQueries(name: string): string[] {
  const bare = name.replace(GENERIC_WORDS, " ").replace(/\s+/g, " ").trim();
  return bare && bare !== name ? [name, bare] : [name];
}
