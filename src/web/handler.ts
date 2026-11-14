import type { Api } from "grammy";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { listAllSuggestions, getById } from "../services/suggestions.js";
import { listGeoPointNames } from "../services/geoPoints.js";
import { resolveRouteGeo } from "../services/geocoding.js";
import { resolveCoordinates } from "../services/coordinates.js";
import { resetPointForName, setPointForName } from "../services/pointEdits.js";
import { refreshRouteMap, renderRouteMap } from "../services/routeMap.js";
import { getGroupConfig } from "../services/groupConfig.js";
import { renderPointsPage } from "./pages.js";
import { pluralRu } from "../utils/plural.js";

export interface WebRequest {
  method: string;
  // Path and query, as Ingress forwards them (without its prefix).
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface WebResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
}

// New on every start; a form from before a restart just asks to reload.
const FORM_TOKEN = randomBytes(16).toString("hex");

function tokenOk(token: string | null): boolean {
  if (!token || token.length !== FORM_TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(FORM_TOKEN));
}

const html = (body: string, status = 200): WebResponse => ({
  status,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  body,
});

const text = (body: string, status: number): WebResponse => ({
  status,
  headers: { "Content-Type": "text/plain; charset=utf-8" },
  body,
});

// Back to the page (relative: Ingress adds its own prefix), with a note.
const backWith = (message: string): WebResponse => ({
  status: 303,
  headers: { Location: `./?msg=${encodeURIComponent(message)}` },
  body: "",
});

function header(req: WebRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

// The Home Assistant user who made the change (Ingress tells).
function haUser(req: WebRequest): string | null {
  const name = header(req, "x-remote-user-display-name") ?? header(req, "x-remote-user-name");
  return name ? decodeURIComponent(name) : null;
}

async function mapNote(api: Api): Promise<string> {
  const { groupChatId } = await getGroupConfig();
  return (await refreshRouteMap(api, groupChatId)) ? " Карта к открытому опросу перерисована." : "";
}

async function savePoint(api: Api, req: WebRequest, form: URLSearchParams): Promise<WebResponse> {
  const name = form.get("name")?.trim();
  if (!name) return text("Не указано название точки.", 400);

  if (form.get("action") === "reset") {
    const result = await resetPointForName(name);
    if (result.kind === "unavailable") return backWith(`«${name}»: поиск по карте сейчас недоступен, точка не изменилась.`);
    const found = result.kind === "found" ? `по названию найдено ${result.point.lat.toFixed(5)}, ${result.point.lon.toFixed(5)}` : "по названию не нашлось";
    return backWith(`«${name}»: ручная точка забыта, ${found}.${await mapNote(api)}`);
  }

  const value = form.get("value")?.trim() ?? "";
  const point = value ? await resolveCoordinates(value) : null;
  if (!point) {
    return backWith(`«${name}»: не понял координаты «${value}». Нужно «40.7512, 44.9596» или ссылка на точку в Google, Яндекс Картах или OpenStreetMap.`);
  }
  const places = await setPointForName(name, point, { userId: null, via: "homeassistant", name: haUser(req) });
  return backWith(
    `«${name}» → ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)} (${places} ${pluralRu(places, ["место", "места", "мест"])}).${await mapNote(api)}`,
  );
}

async function locate(api: Api, form: URLSearchParams): Promise<WebResponse> {
  const place = await getById(form.get("id") ?? "");
  if (!place) return backWith("Место не найдено — возможно, его удалили.");
  const geo = await resolveRouteGeo(place);
  if (geo.unavailable) return backWith(`#${place.seq}: поиск по карте сейчас недоступен, попробуйте позже.`);
  const found = geo.points.filter(Boolean).length;
  return backWith(`#${place.seq}: найдено точек — ${found} из ${geo.names.length}.${await mapNote(api)}`);
}

async function preview(id: string): Promise<WebResponse> {
  const place = await getById(id);
  if (!place) return text("Место не найдено.", 404);
  const map = await renderRouteMap([place]);
  if (!map.picture) return text("Нарисовать не получилось: точек нет или карта OpenStreetMap недоступна.", 404);
  return { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "no-store" }, body: map.picture.image };
}

/**
 * The Home Assistant panel: a page with every place's route points and
 * forms to correct them. Pure request → response, so tests need no server.
 */
export async function handleWeb(api: Api, req: WebRequest): Promise<WebResponse> {
  const url = new URL(req.url, "http://panel");
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "GET" && path === "/") {
    const [places, manual] = await Promise.all([listAllSuggestions(), listGeoPointNames()]);
    return html(renderPointsPage({ places, manual, message: url.searchParams.get("msg"), formToken: FORM_TOKEN }));
  }

  const previewMatch = /^\/preview\/([^/]+)\.png$/.exec(path);
  if (req.method === "GET" && previewMatch) return preview(decodeURIComponent(previewMatch[1]));

  if (req.method === "POST" && (path === "/points" || path === "/locate")) {
    const form = new URLSearchParams(req.body);
    if (!tokenOk(form.get("token"))) return backWith("Страница устарела (бот перезапускался) — повторите действие.");
    return path === "/points" ? savePoint(api, req, form) : locate(api, form);
  }

  return text("Не найдено.", 404);
}

export const formTokenForTests = FORM_TOKEN;
