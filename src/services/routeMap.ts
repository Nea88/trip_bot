import { InputFile, type Api } from "grammy";
import { PNG } from "pngjs";
import type { SuggestionWithId } from "../types/index.js";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  ROUTE_COLORS,
  TILE_SIZE,
  drawRoutes,
  fitView,
  routeMapCaption,
  tilesFor,
  type Canvas,
  type CaptionRoute,
  type GeoPoint,
  type MapView,
  type RouteToDraw,
} from "../utils/routeMap.js";
import { resolveRouteGeo } from "./geocoding.js";
import { OSM_USER_AGENT } from "../constants.js";

type Fetcher = (url: string) => Promise<Response>;

let fetcher: Fetcher = (url) =>
  fetch(url, { headers: { "User-Agent": OSM_USER_AGENT }, signal: AbortSignal.timeout(10000) });

// Replaceable for tests, which must never reach the network.
export function setTileFetcher(fn: Fetcher): void {
  fetcher = fn;
}

// OSM's tile policy asks for few parallel downloads.
const PARALLEL_TILES = 4;
// Shown where a tile couldn't be downloaded.
const BACKGROUND = 230;

async function fetchTile(zoom: number, x: number, y: number): Promise<PNG> {
  const res = await fetcher(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
  if (!res.ok) throw new Error(`tile HTTP ${res.status}`);
  return PNG.sync.read(Buffer.from(await res.arrayBuffer()));
}

function blit(canvas: Canvas, tile: PNG, left: number, top: number): void {
  for (let ty = 0; ty < TILE_SIZE; ty++) {
    const y = top + ty;
    if (y < 0 || y >= canvas.height) continue;
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      const x = left + tx;
      if (x < 0 || x >= canvas.width) continue;
      const from = (ty * tile.width + tx) * 4;
      const to = (y * canvas.width + x) * 4;
      canvas.data[to] = tile.data[from];
      canvas.data[to + 1] = tile.data[from + 1];
      canvas.data[to + 2] = tile.data[from + 2];
      canvas.data[to + 3] = 255;
    }
  }
}

// The OSM map under the view, or null when no tile could be downloaded.
async function basemap(view: MapView): Promise<PNG | null> {
  const png = new PNG({ width: MAP_WIDTH, height: MAP_HEIGHT });
  png.data.fill(BACKGROUND);
  const tiles = tilesFor(view);
  let loaded = 0;
  for (let i = 0; i < tiles.length; i += PARALLEL_TILES) {
    await Promise.all(
      tiles.slice(i, i + PARALLEL_TILES).map(async (t) => {
        try {
          blit(png, await fetchTile(view.zoom, t.x, t.y), t.left, t.top);
          loaded++;
        } catch (err) {
          console.error(`[routeMap] Tile ${view.zoom}/${t.x}/${t.y} unavailable:`, err instanceof Error ? err.message : err);
        }
      }),
    );
  }
  return loaded > 0 ? png : null;
}

export interface RouteMap {
  image: Buffer;
  caption: string;
}

/**
 * One picture with every option's route (in poll order), or null when no
 * option could be found on the map or the map itself is unavailable.
 */
export async function renderRouteMap(options: SuggestionWithId[]): Promise<RouteMap | null> {
  const routes: RouteToDraw[] = [];
  const caption: CaptionRoute[] = [];
  for (const option of options) {
    const geo = await resolveRouteGeo(option);
    if (geo.start || geo.finish) {
      const colorIndex = routes.length;
      routes.push({ colorIndex, start: geo.start, finish: geo.finish });
      caption.push({ text: option.text, colorIndex });
    } else {
      caption.push({ text: option.text, colorIndex: null });
    }
  }
  const points = routes.flatMap((r) => [r.start, r.finish]).filter((p): p is GeoPoint => p !== null);
  if (points.length === 0) return null;

  const view = fitView(points);
  const png = await basemap(view);
  if (!png) return null;
  drawRoutes(png, routes, view);
  return { image: PNG.sync.write(png), caption: routeMapCaption(caption) };
}

/**
 * Posts the route map as a reply to the poll. Never throws: the poll is
 * what matters, the map only helps to picture the options.
 */
export async function postRouteMap(
  api: Api,
  chatId: number,
  options: SuggestionWithId[],
  pollMessageId: number,
): Promise<boolean> {
  try {
    const map = await renderRouteMap(options.slice(0, ROUTE_COLORS.length));
    if (!map) return false;
    await api.sendPhoto(chatId, new InputFile(map.image, "routes.png"), {
      caption: map.caption,
      reply_parameters: { message_id: pollMessageId, allow_sending_without_reply: true },
    });
    return true;
  } catch (err) {
    console.error("[routeMap] Route map not posted:", err);
    return false;
  }
}
