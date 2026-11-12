import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCoordinates } from "./coordinates.js";

const PARZ = { lat: 40.7512, lon: 44.9596 };

test("parseCoordinates: a typed pair", () => {
  assert.deepEqual(parseCoordinates("40.7512, 44.9596"), PARZ);
  assert.deepEqual(parseCoordinates(" 40.7512 44.9596 "), PARZ);
  assert.deepEqual(parseCoordinates("40.7512;44.9596"), PARZ);
});

test("parseCoordinates: degrees, minutes, seconds", () => {
  const point = parseCoordinates(`40°45'04.3"N 44°57'34.6"E`)!;
  assert.ok(Math.abs(point.lat - 40.7512) < 1e-4 && Math.abs(point.lon - 44.9596) < 1e-4);
});

test("parseCoordinates: Google Maps links", () => {
  assert.deepEqual(parseCoordinates("https://www.google.com/maps/@40.7512,44.9596,15z"), PARZ);
  assert.deepEqual(
    parseCoordinates("https://www.google.com/maps/place/Parz+Lake/@40.70,44.90,13z/data=!3m1!4b1!4m6!3m5!3d40.7512!4d44.9596"),
    PARZ,
  );
  assert.deepEqual(parseCoordinates("https://maps.google.com/?q=40.7512,44.9596"), PARZ);
  assert.deepEqual(parseCoordinates("https://www.google.com/maps/search/40.7512,+44.9596?entry=tts"), PARZ);
  assert.deepEqual(parseCoordinates("вот тут https://www.google.com/maps/@40.7512,44.9596,15z смотри"), PARZ);
});

test("parseCoordinates: Yandex links put longitude first", () => {
  assert.deepEqual(parseCoordinates("https://yandex.ru/maps/?ll=44.9596%2C40.7512&z=14"), PARZ);
  assert.deepEqual(parseCoordinates("https://yandex.ru/maps/?ll=44.0%2C40.0&pt=44.9596,40.7512&z=14"), PARZ);
  assert.deepEqual(
    parseCoordinates("https://yandex.com/maps/?whatshere%5Bpoint%5D=44.9596%2C40.7512&whatshere%5Bzoom%5D=16"),
    PARZ,
  );
});

test("parseCoordinates: OpenStreetMap links", () => {
  assert.deepEqual(parseCoordinates("https://www.openstreetmap.org/?mlat=40.7512&mlon=44.9596#map=15/40.7/44.9"), PARZ);
  assert.deepEqual(parseCoordinates("https://www.openstreetmap.org/#map=15/40.7512/44.9596"), PARZ);
});

test("parseCoordinates: rejects what isn't a point", () => {
  assert.equal(parseCoordinates("озеро Парз"), null);
  assert.equal(parseCoordinates("120.5, 44.9"), null);
  assert.equal(parseCoordinates("0, 0"), null);
  assert.equal(parseCoordinates("https://maps.app.goo.gl/AbCdEf123"), null);
  assert.equal(parseCoordinates("https://example.com/page"), null);
});
