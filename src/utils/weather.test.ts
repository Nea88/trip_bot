import { test } from "node:test";
import assert from "node:assert/strict";
import { describeWeatherCode, formatWeather, weatherAt, type HourlyForecast } from "./weather.js";

const forecast: HourlyForecast = {
  hourly: {
    time: ["2026-10-03T08:00", "2026-10-03T09:00", "2026-10-03T10:00"],
    temperature_2m: [5.6, -0.4, null],
    precipitation_probability: [10, 20, 30],
    weather_code: [0, 3, 61],
    wind_speed_10m: [1.2, 4.4, 5],
  },
};

test("weatherAt takes the hour the ride starts in", () => {
  assert.deepEqual(weatherAt(forecast, "2026-10-03", "09:30"), {
    hour: "09:00",
    temperature: -0.4,
    precipitationProbability: 20,
    weatherCode: 3,
    windSpeed: 4.4,
  });
});

test("weatherAt returns null outside the forecast or without data", () => {
  assert.equal(weatherAt(forecast, "2026-10-04", "09:00"), null);
  assert.equal(weatherAt(forecast, "2026-10-03", "10:15"), null);
});

test("formatWeather reads naturally", () => {
  assert.equal(
    formatWeather({ hour: "09:00", temperature: 12.4, precipitationProbability: 20, weatherCode: 3, windSpeed: 4.4 }),
    "Погода к 09:00: +12°C, пасмурно, ветер 4 м/с, осадки 20%",
  );
  assert.equal(
    formatWeather({ hour: "07:00", temperature: -0.4, precipitationProbability: null, weatherCode: null, windSpeed: null }),
    "Погода к 07:00: 0°C",
  );
});

test("weather codes map to Russian words", () => {
  assert.equal(describeWeatherCode(0), "ясно");
  assert.equal(describeWeatherCode(63), "дождь");
  assert.equal(describeWeatherCode(95), "гроза");
});
