import { InputFile, type Api } from "grammy";
import { PNG } from "pngjs";
import type { PollDocWithId, SuggestionWithId } from "../types/index.js";
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
  type MapView,
  type RouteToDraw,
} from "../utils/routeMap.js";
import { normalizePlaceName, pointKind } from "../utils/routeText.js";
import { resolveRouteGeo } from "./geocoding.js";
import { getGeoPrompt, saveGeoPrompt } from "./geoPoints.js";
import { getOpenPoll, setRouteMapMessageId } from "./polls.js";
import { getById } from "./suggestions.js";
import { sendToOwnerDm } from "./notifications.js";
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

export interface MissingPoint {
  name: string;
  placeText: string;
}

export interface RouteMap {
  // null when nothing could be drawn: no point found or no map tiles.
  picture: { image: Buffer; caption: string } | null;
  // Names the geocoder looked up and didn't find — the owner is asked.
  missing: MissingPoint[];
}

/**
 * One picture with every option's route (in poll order): what's found is
 * drawn, what isn't is listed in the caption and returned as missing.
 */
export async function renderRouteMap(options: SuggestionWithId[]): Promise<RouteMap> {
  const routes: RouteToDraw[] = [];
  const caption: CaptionRoute[] = [];
  const missing: MissingPoint[] = [];
  for (const option of options.slice(0, ROUTE_COLORS.length)) {
    const geo = await resolveRouteGeo(option);
    const points = geo.points.flatMap((point, i) =>
      point ? [{ point, kind: pointKind(i, geo.points.length) }] : [],
    );
    const notFound = geo.names.filter((_, i) => !geo.points[i]);
    if (!geo.unavailable) missing.push(...notFound.map((name) => ({ name, placeText: option.text })));
    if (points.length > 0) {
      const colorIndex = routes.length;
      routes.push({ colorIndex, points });
      caption.push({ text: option.text, colorIndex, missing: notFound });
    } else {
      caption.push({ text: option.text, colorIndex: null, missing: notFound });
    }
  }
  const all = routes.flatMap((r) => r.points.map((p) => p.point));
  if (all.length === 0) return { picture: null, missing };

  const view = fitView(all);
  const png = await basemap(view);
  if (!png) return { picture: null, missing };
  drawRoutes(png, routes, view);
  return { picture: { image: PNG.sync.write(png), caption: routeMapCaption(caption) }, missing };
}

// Don't nag the owner about the same name every time the map is drawn.
const ASK_AGAIN_AFTER_MS = 6 * 24 * 60 * 60 * 1000;

export const GEO_PROMPT_HINT =
  "Пришлите ответом на это сообщение координаты (например, 40.7512, 44.9596) или ссылку на точку в Google, Яндекс Картах или OpenStreetMap.";

/**
 * Asks the group owner in DM where each missing point is; the answer
 * (a reply to the question) is handled by geoPointAnswerHandler.
 */
async function askOwner(api: Api, groupChatId: number, missing: MissingPoint[]): Promise<void> {
  const seen = new Set<string>();
  for (const { name, placeText } of missing) {
    const key = normalizePlaceName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const prompt = await getGeoPrompt(name);
    if (prompt && Date.now() - prompt.askedAt.toMillis() < ASK_AGAIN_AFTER_MS) continue;
    const where = placeText === name ? "" : ` — точка маршрута «${placeText}»`;
    const sent = await sendToOwnerDm(api, groupChatId, async (dmChatId) => {
      const message = await api.sendMessage(
        dmChatId,
        `🗺 Не нашёл на карте «${name}»${where}.\n${GEO_PROMPT_HINT}`,
        { reply_markup: { force_reply: true, input_field_placeholder: "40.7512, 44.9596 или ссылка" } },
      );
      await saveGeoPrompt(name, placeText, dmChatId, message.message_id);
    });
    if (!sent) {
      console.error("[routeMap] Can't ask the owner about missing points: no DM with the owner (/start)");
      return;
    }
  }
}

async function pollOptions(poll: PollDocWithId): Promise<SuggestionWithId[]> {
  const options = await Promise.all(poll.optionSuggestionIds.map((id) => (id ? getById(id) : null)));
  return options.filter((s): s is SuggestionWithId => s !== null);
}

async function sendMap(api: Api, poll: PollDocWithId, picture: NonNullable<RouteMap["picture"]>): Promise<void> {
  const message = await api.sendPhoto(poll.groupChatId, new InputFile(picture.image, "routes.png"), {
    caption: picture.caption,
    reply_parameters: { message_id: poll.messageId, allow_sending_without_reply: true },
  });
  await setRouteMapMessageId(poll.id, message.message_id);
}

/**
 * Posts the route map as a reply to the poll and asks the owner about the
 * points that weren't found. Never throws: the poll is what matters, the
 * map only helps to picture the options.
 */
export async function postRouteMap(api: Api, poll: PollDocWithId, options?: SuggestionWithId[]): Promise<boolean> {
  try {
    const map = await renderRouteMap(options ?? (await pollOptions(poll)));
    if (map.picture) await sendMap(api, poll, map.picture);
    await askOwner(api, poll.groupChatId, map.missing);
    return map.picture !== null;
  } catch (err) {
    console.error("[routeMap] Route map not posted:", err);
    return false;
  }
}

/**
 * Redraws the open poll's map after a point was given: the picture in the
 * same message is replaced, or posted if there was none yet.
 */
export async function refreshRouteMap(api: Api, groupChatId: number): Promise<boolean> {
  const poll = await getOpenPoll(groupChatId);
  if (!poll) return false;
  try {
    const map = await renderRouteMap(await pollOptions(poll));
    if (!map.picture) return false;
    if (poll.routeMapMessageId) {
      try {
        await api.editMessageMedia(poll.groupChatId, poll.routeMapMessageId, {
          type: "photo",
          media: new InputFile(map.picture.image, "routes.png"),
          caption: map.picture.caption,
        });
        return true;
      } catch (err) {
        // Deleted by someone, or too old to edit — post a new one.
        console.error("[routeMap] Route map not edited, posting anew:", err);
      }
    }
    await sendMap(api, poll, map.picture);
    return true;
  } catch (err) {
    console.error("[routeMap] Route map not refreshed:", err);
    return false;
  }
}
