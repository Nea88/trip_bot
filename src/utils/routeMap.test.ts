import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
  drawRoutes,
  fitView,
  placeMarkers,
  project,
  routeMapCaption,
  tilesFor,
} from "./routeMap.js";

const SEMYONOVKA = { lat: 40.659, lon: 44.9006 };
const TSOVAGYUGH = { lat: 40.632, lon: 44.9583 };
const GOSH = { lat: 40.7297, lon: 44.9958 };
const ARAGATS = { lat: 40.5233, lon: 44.1934 };

test("project: tile coordinates match OSM's", () => {
  // Yerevan sits in tile 10/638/386.
  const p = project({ lat: 40.18, lon: 44.51 }, 10);
  assert.equal(Math.floor(p.x / TILE_SIZE), 638);
  assert.equal(Math.floor(p.y / TILE_SIZE), 386);
});

test("fitView: every point lands inside the picture", () => {
  const points = [SEMYONOVKA, TSOVAGYUGH, GOSH, ARAGATS];
  const view = fitView(points);
  for (const point of points) {
    const p = project(point, view.zoom);
    const x = p.x - view.originX;
    const y = p.y - view.originY;
    assert.ok(x > 0 && x < MAP_WIDTH && y > 0 && y < MAP_HEIGHT, `${x},${y} at zoom ${view.zoom}`);
  }
  // Points close together zoom in more than the spread-out set.
  assert.ok(fitView([SEMYONOVKA, GOSH]).zoom > view.zoom);
  // A single point doesn't zoom in to street level.
  assert.equal(fitView([GOSH]).zoom, 12);
});

test("tilesFor: the tiles cover the whole picture", () => {
  const view = fitView([SEMYONOVKA, ARAGATS]);
  const tiles = tilesFor(view);
  assert.ok(tiles.every((t) => t.left > -TILE_SIZE && t.top > -TILE_SIZE && t.left < MAP_WIDTH && t.top < MAP_HEIGHT));
  const minLeft = Math.min(...tiles.map((t) => t.left));
  const maxLeft = Math.max(...tiles.map((t) => t.left));
  assert.ok(minLeft <= 0 && maxLeft + TILE_SIZE >= MAP_WIDTH);
  assert.ok(tiles.length <= 5 * 4 + 5);
});

test("placeMarkers: routes from the same village get spread apart", () => {
  const routes = [
    { colorIndex: 0, points: [{ point: SEMYONOVKA, kind: "start" as const }, { point: GOSH, kind: "finish" as const }] },
    { colorIndex: 1, points: [{ point: SEMYONOVKA, kind: "start" as const }, { point: TSOVAGYUGH, kind: "finish" as const }] },
  ];
  const markers = placeMarkers(routes, fitView([SEMYONOVKA, GOSH, TSOVAGYUGH]));
  const starts = markers.filter((m) => m.kind === "start");
  assert.equal(starts.length, 2);
  assert.ok(Math.hypot(starts[0].x - starts[1].x, starts[0].y - starts[1].y) >= 14);
});

test("drawRoutes: start in the route's colour, picture otherwise untouched", () => {
  const canvas = { width: MAP_WIDTH, height: MAP_HEIGHT, data: new Uint8Array(MAP_WIDTH * MAP_HEIGHT * 4) };
  const view = fitView([SEMYONOVKA, GOSH]);
  drawRoutes(
    canvas,
    [{ colorIndex: 0, points: [{ point: SEMYONOVKA, kind: "start" }, { point: TSOVAGYUGH, kind: "via" }, { point: GOSH, kind: "finish" }] }],
    view,
  );
  const colorAt = (point: { lat: number; lon: number }) => {
    const p = project(point, view.zoom);
    const i = (Math.floor(p.y - view.originY) * MAP_WIDTH + Math.floor(p.x - view.originX)) * 4;
    return [...canvas.data.slice(i, i + 4)];
  };
  for (const point of [SEMYONOVKA, TSOVAGYUGH, GOSH]) assert.deepEqual(colorAt(point), [229, 57, 53, 255]);
  assert.equal(canvas.data[3], 0);
});

test("routeMapCaption: numbers follow the poll, unknown places and points are marked", () => {
  assert.equal(
    routeMapCaption([
      { text: "Семёновка — Гош", colorIndex: 0, missing: [] },
      { text: "Цовагюх — Тайник — Гош", colorIndex: 1, missing: ["Тайник"] },
      { text: "Тайное озеро", colorIndex: null, missing: ["Тайное озеро"] },
    ]),
    [
      "🗺 Варианты из опроса на карте: ● старт, • через, ■ финиш",
      "🔴 1. Семёновка — Гош",
      "🔵 2. Цовагюх — Тайник — Гош (без «Тайник»)",
      "⚪ 3. Тайное озеро — не нашёл на карте",
      "",
      "Карта © участники OpenStreetMap",
    ].join("\n"),
  );
  assert.ok(routeMapCaption(Array.from({ length: 9 }, () => ({ text: "я".repeat(300), colorIndex: 0, missing: ["ю".repeat(300)] }))).length <= 1024);
});
