import { escapeHtml } from "../utils/html.js";
import { normalizePlaceName, pointKind, type PointKind } from "../utils/routeText.js";
import type { RouteGeo, SuggestionStatus } from "../types/index.js";

// The Home Assistant panel's page, rendered on the server. Every link and
// form target is relative: Ingress serves the page under
// /api/hassio_ingress/<token>/.

export interface PlaceRow {
  id: string;
  seq: number;
  text: string;
  status: SuggestionStatus;
  routeGeo?: RouteGeo;
}

export interface PointsPage {
  places: PlaceRow[];
  // Normalized names with a point given by hand.
  manual: Set<string>;
  // Result of the last action, shown on top.
  message: string | null;
  // Sent back with every form, so other sites can't post to the panel.
  formToken: string;
}

const KIND_LABELS: Record<PointKind, string> = { start: "старт", via: "через", finish: "финиш" };
const STATUS_LABELS: Partial<Record<SuggestionStatus, string>> = { active: "в пуле", excluded: "исключено" };

const STYLE = `
:root { --bg: #f6f7f9; --card: #fff; --text: #1c1f23; --muted: #667085; --line: #e3e6ea; --accent: #1e88e5; --warn: #c62828; --ok: #2e7d32; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #111418; --card: #1b1f24; --text: #e8eaed; --muted: #9aa3ad; --line: #2c323a; --accent: #64b5f6; --warn: #ef9a9a; --ok: #a5d6a7; }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 980px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 4px; }
.hint { color: var(--muted); margin: 0 0 16px; }
.message { background: var(--card); border-left: 4px solid var(--accent); padding: 10px 14px; margin-bottom: 16px; border-radius: 6px; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
section h2 { font-size: 16px; margin: 0 0 8px; display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; }
.status { color: var(--muted); font-weight: normal; font-size: 13px; }
.preview { margin-left: auto; font-size: 13px; font-weight: normal; }
a { color: var(--accent); }
table { width: 100%; border-collapse: collapse; }
td { padding: 6px 8px 6px 0; border-top: 1px solid var(--line); vertical-align: middle; }
td.kind { color: var(--muted); width: 60px; }
td.coords { font-variant-numeric: tabular-nums; white-space: nowrap; }
.missing { color: var(--warn); }
.source { color: var(--muted); font-size: 12px; display: block; }
form.point { display: flex; gap: 6px; flex-wrap: wrap; }
input[type=text] { flex: 1 1 220px; min-width: 0; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--text); font: inherit; }
button { padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--text); font: inherit; cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.empty { color: var(--muted); }
@media (max-width: 640px) { td { display: block; border-top: none; padding: 2px 0; } tr { display: block; border-top: 1px solid var(--line); padding: 8px 0; } }
`;

function hidden(name: string, value: string): string {
  return `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
}

function pointRows(place: PlaceRow, geo: RouteGeo, page: PointsPage): string {
  return geo.names
    .map((name, i) => {
      const point = geo.points[i];
      const manual = page.manual.has(normalizePlaceName(name));
      const coords = point
        ? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}<span class="source">${manual ? "указано вручную" : "найдено по названию"}</span>`
        : `<span class="missing">не найдено</span>`;
      const reset = manual ? `<button name="action" value="reset" title="Забыть ручную точку и искать по названию">Сбросить</button>` : "";
      return `<tr>
  <td class="kind">${KIND_LABELS[pointKind(i, geo.names.length)]}</td>
  <td>${escapeHtml(name)}</td>
  <td class="coords">${coords}</td>
  <td><form class="point" method="post" action="points">${hidden("token", page.formToken)}${hidden("name", name)}
    <input type="text" name="value" placeholder="40.7512, 44.9596 или ссылка на карту" aria-label="Новые координаты для ${escapeHtml(name)}">
    <button class="primary" name="action" value="save">Сохранить</button>${reset}</form></td>
</tr>`;
    })
    .join("\n");
}

function placeSection(place: PlaceRow, page: PointsPage): string {
  const geo = place.routeGeo;
  const fresh = geo && Array.isArray(geo.points) && geo.sourceText === place.text;
  const locate = `<form method="post" action="locate">${hidden("token", page.formToken)}${hidden("id", place.id)}<button>${geo ? "Найти точки заново" : "Найти точки"}</button></form>`;
  const body = fresh
    ? geo.names.length > 0
      ? `<table>${pointRows(place, geo, page)}</table>`
      : `<p class="empty">В названии нет точек.</p>`
    : `<p class="empty">${geo ? "Название изменилось — точки ещё не искали." : "Точки ещё не искали: это происходит, когда место попадает в опрос."}</p>${locate}`;
  const preview = fresh && geo.points.some(Boolean) ? `<a class="preview" href="preview/${encodeURIComponent(place.id)}.png" target="_blank" rel="noopener">Показать карту</a>` : "";
  return `<section>
  <h2>#${place.seq} ${escapeHtml(place.text)} <span class="status">${STATUS_LABELS[place.status] ?? ""}</span>${preview}</h2>
  ${body}
</section>`;
}

export function renderPointsPage(page: PointsPage): string {
  const places = page.places.filter((p) => p.status === "active" || p.status === "excluded");
  const sorted = [...places].sort((a, b) => (a.status === b.status ? b.seq - a.seq : a.status === "active" ? -1 : 1));
  const message = page.message ? `<div class="message" role="status">${escapeHtml(page.message)}</div>` : "";
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Точки маршрутов</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Точки маршрутов</h1>
<p class="hint">Точки бот ищет по названию места («Старт — Через — Финиш»). Поправленная здесь точка запоминается для этого названия во всех местах, а карта к открытому опросу перерисовывается. Координаты — «40.7512, 44.9596» или ссылка на Google, Яндекс Карты или OpenStreetMap.</p>
${message}
${sorted.length > 0 ? sorted.map((p) => placeSection(p, page)).join("\n") : `<p class="empty">Мест пока нет.</p>`}
</main>
</body>
</html>`;
}
