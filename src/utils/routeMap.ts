// Pure parts of the poll's route map: Web Mercator maths, which OSM tiles
// cover the picture, drawing markers on an RGBA buffer, and the caption.
// Fetching tiles and PNG encoding live in services/routeMap.ts.
import type { PointKind } from "./routeText.js";

export interface GeoPoint {
  lat: number;
  lon: number;
}

export const TILE_SIZE = 256;
export const MAP_WIDTH = 1024;
export const MAP_HEIGHT = 768;
// Room around the outermost markers.
const PADDING = 70;
const MIN_ZOOM = 5;
// A lone point (or routes very close together) shouldn't zoom in to single streets.
const MAX_ZOOM = 12;

// Colours match the caption's circle emoji, in poll order.
export const ROUTE_COLORS: { emoji: string; rgb: [number, number, number] }[] = [
  { emoji: "🔴", rgb: [229, 57, 53] },
  { emoji: "🔵", rgb: [30, 136, 229] },
  { emoji: "🟢", rgb: [67, 160, 71] },
  { emoji: "🟠", rgb: [251, 140, 0] },
  { emoji: "🟣", rgb: [142, 36, 170] },
  { emoji: "🟡", rgb: [253, 216, 53] },
  { emoji: "🟤", rgb: [109, 76, 65] },
  { emoji: "⚫", rgb: [33, 33, 33] },
  { emoji: "🩷", rgb: [236, 64, 122] },
];
export const NOT_FOUND_EMOJI = "⚪";

// Global pixel coordinates at a zoom level.
export function project(point: GeoPoint, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-85, Math.min(85, point.lat)) * (Math.PI / 180);
  return {
    x: ((point.lon + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * scale,
  };
}

export interface MapView {
  zoom: number;
  // Global pixel coordinates of the picture's top-left corner.
  originX: number;
  originY: number;
}

// The largest zoom at which every point fits inside the padded picture.
export function fitView(points: GeoPoint[]): MapView {
  let zoom = MAX_ZOOM;
  for (; zoom > MIN_ZOOM; zoom--) {
    const px = points.map((p) => project(p, zoom));
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    if (
      Math.max(...xs) - Math.min(...xs) <= MAP_WIDTH - 2 * PADDING &&
      Math.max(...ys) - Math.min(...ys) <= MAP_HEIGHT - 2 * PADDING
    ) {
      break;
    }
  }
  const px = points.map((p) => project(p, zoom));
  const xs = px.map((p) => p.x);
  const ys = px.map((p) => p.y);
  const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
  return { zoom, originX: Math.round(centerX - MAP_WIDTH / 2), originY: Math.round(centerY - MAP_HEIGHT / 2) };
}

export interface TilePlacement {
  // Tile address as OSM serves it (x wrapped around the world).
  x: number;
  y: number;
  // Where the tile's top-left corner lands in the picture.
  left: number;
  top: number;
}

export function tilesFor(view: MapView): TilePlacement[] {
  const count = 2 ** view.zoom;
  const tiles: TilePlacement[] = [];
  const firstX = Math.floor(view.originX / TILE_SIZE);
  const lastX = Math.floor((view.originX + MAP_WIDTH - 1) / TILE_SIZE);
  const firstY = Math.max(0, Math.floor(view.originY / TILE_SIZE));
  const lastY = Math.min(count - 1, Math.floor((view.originY + MAP_HEIGHT - 1) / TILE_SIZE));
  for (let ty = firstY; ty <= lastY; ty++) {
    for (let tx = firstX; tx <= lastX; tx++) {
      tiles.push({
        x: ((tx % count) + count) % count,
        y: ty,
        left: tx * TILE_SIZE - view.originX,
        top: ty * TILE_SIZE - view.originY,
      });
    }
  }
  return tiles;
}

export interface RouteToDraw {
  colorIndex: number;
  // Found points only, in route order.
  points: { point: GeoPoint; kind: PointKind }[];
}

interface Marker {
  route: number;
  kind: PointKind;
  x: number;
  y: number;
}

// Markers this close would hide each other.
const OVERLAP_PX = 14;
const SPREAD_PX = 10;

/**
 * Picture positions of every marker, per route in route order. Markers on
 * (almost) the same spot — two routes from one village — are spread on a
 * small ring around it, so each colour stays visible.
 */
export function placeMarkers(routes: RouteToDraw[], view: MapView): Marker[] {
  const markers: Marker[] = [];
  routes.forEach((route, i) => {
    for (const { point, kind } of route.points) {
      const p = project(point, view.zoom);
      markers.push({ route: i, kind, x: p.x - view.originX, y: p.y - view.originY });
    }
  });

  const groups: Marker[][] = [];
  for (const marker of markers) {
    const group = groups.find((g) => Math.hypot(g[0].x - marker.x, g[0].y - marker.y) < OVERLAP_PX);
    if (group) group.push(marker);
    else groups.push([marker]);
  }
  for (const group of groups) {
    if (group.length < 2) continue;
    const cx = group.reduce((sum, m) => sum + m.x, 0) / group.length;
    const cy = group.reduce((sum, m) => sum + m.y, 0) / group.length;
    group.forEach((m, k) => {
      const angle = (2 * Math.PI * k) / group.length - Math.PI / 2;
      m.x = cx + SPREAD_PX * Math.cos(angle);
      m.y = cy + SPREAD_PX * Math.sin(angle);
    });
  }
  return markers;
}

type Rgb = [number, number, number];
const WHITE: Rgb = [255, 255, 255];

// An RGBA picture, row by row, as pngjs keeps it.
export interface Canvas {
  width: number;
  height: number;
  data: Uint8Array;
}

function fill(canvas: Canvas, minX: number, minY: number, maxX: number, maxY: number, inside: (x: number, y: number) => boolean, rgb: Rgb): void {
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(canvas.width - 1, Math.ceil(maxX));
  const y1 = Math.min(canvas.height - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const i = (y * canvas.width + x) * 4;
      canvas.data[i] = rgb[0];
      canvas.data[i + 1] = rgb[1];
      canvas.data[i + 2] = rgb[2];
      canvas.data[i + 3] = 255;
    }
  }
}

function line(canvas: Canvas, ax: number, ay: number, bx: number, by: number, radius: number, rgb: Rgb): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  fill(canvas, Math.min(ax, bx) - radius, Math.min(ay, by) - radius, Math.max(ax, bx) + radius, Math.max(ay, by) + radius, (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= radius;
  }, rgb);
}

function circle(canvas: Canvas, cx: number, cy: number, radius: number, rgb: Rgb): void {
  fill(canvas, cx - radius, cy - radius, cx + radius, cy + radius, (x, y) => Math.hypot(x - cx, y - cy) <= radius, rgb);
}

function square(canvas: Canvas, cx: number, cy: number, half: number, rgb: Rgb): void {
  fill(canvas, cx - half, cy - half, cx + half, cy + half, () => true, rgb);
}

/**
 * Draws every route over the map: a line through its points, a circle at
 * the start, small dots at via points and a square at the finish, each with
 * a white outline so it reads on any background. Lines go first so no
 * marker is hidden under one; via points before ends for the same reason.
 */
export function drawRoutes(canvas: Canvas, routes: RouteToDraw[], view: MapView): void {
  const markers = placeMarkers(routes, view);
  const colorOf = (route: number) => ROUTE_COLORS[routes[route].colorIndex % ROUTE_COLORS.length].rgb;
  const paths = routes.map((_, i) => markers.filter((m) => m.route === i));
  for (const [radius, color] of [[4.5, null], [2.5, "route"]] as const) {
    paths.forEach((path, i) => {
      for (let k = 1; k < path.length; k++) {
        line(canvas, path[k - 1].x, path[k - 1].y, path[k].x, path[k].y, radius, color ? colorOf(i) : WHITE);
      }
    });
  }
  const ordered = [...markers.filter((m) => m.kind === "via"), ...markers.filter((m) => m.kind !== "via")];
  for (const m of ordered) {
    if (m.kind === "start") {
      circle(canvas, m.x, m.y, 10, WHITE);
      circle(canvas, m.x, m.y, 7.5, colorOf(m.route));
    } else if (m.kind === "via") {
      circle(canvas, m.x, m.y, 6.5, WHITE);
      circle(canvas, m.x, m.y, 4.5, colorOf(m.route));
    } else {
      square(canvas, m.x, m.y, 9, WHITE);
      square(canvas, m.x, m.y, 6.5, colorOf(m.route));
    }
  }
}

export interface CaptionRoute {
  text: string;
  // null when nothing in the text was found on the map.
  colorIndex: number | null;
  // Points of the route that weren't found (when some were).
  missing: string[];
}

const MAX_NAME_LENGTH = 80;

function shorten(text: string): string {
  return text.length > MAX_NAME_LENGTH ? `${text.slice(0, MAX_NAME_LENGTH - 1)}…` : text;
}

// Numbers follow the poll's options.
export function routeMapCaption(routes: CaptionRoute[]): string {
  const lines = ["🗺 Варианты из опроса на карте: ● старт, • через, ■ финиш"];
  routes.forEach((route, i) => {
    const name = shorten(route.text);
    if (route.colorIndex === null) {
      lines.push(`${NOT_FOUND_EMOJI} ${i + 1}. ${name} — не нашёл на карте`);
      return;
    }
    const missing = route.missing.length > 0 ? ` (без ${route.missing.map((m) => `«${shorten(m)}»`).join(", ")})` : "";
    lines.push(`${ROUTE_COLORS[route.colorIndex % ROUTE_COLORS.length].emoji} ${i + 1}. ${name}${missing}`);
  });
  lines.push("", "Карта © участники OpenStreetMap");
  // Telegram's caption limit.
  const caption = lines.join("\n");
  return caption.length > 1024 ? `${caption.slice(0, 1023)}…` : caption;
}
