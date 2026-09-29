import { formatWeather, weatherAt, type HourlyForecast } from "../utils/weather.js";

type Fetcher = (url: string) => Promise<Response>;

// Replaceable for tests, which must never reach the network.
let fetcher: Fetcher = (url) => fetch(url, { signal: AbortSignal.timeout(5000) });

export function setWeatherFetcher(fn: Fetcher): void {
  fetcher = fn;
}

/**
 * One line with the forecast for the ride's start (Open-Meteo, free, no key),
 * or null if it can't be had — the announcement then just goes without it.
 */
export async function startWeatherLine(
  latitude: number,
  longitude: number,
  isoDate: string,
  time: string,
  timezone: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    wind_speed_unit: "ms",
    timezone,
    start_date: isoDate,
    end_date: isoDate,
  });
  try {
    const res = await fetcher(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const hour = weatherAt((await res.json()) as HourlyForecast, isoDate, time);
    return hour ? formatWeather(hour) : null;
  } catch (err) {
    console.error("[weather] Forecast unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}
