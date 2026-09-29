// Open-Meteo hourly forecast, as requested by services/weather.ts.
export interface HourlyForecast {
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    precipitation_probability: (number | null)[];
    weather_code: (number | null)[];
    wind_speed_10m: (number | null)[];
  };
}

export interface HourWeather {
  hour: string; // "09:00"
  temperature: number;
  precipitationProbability: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
}

// The forecast hour the ride starts in ("09:30" → the 09:00 slot).
export function weatherAt(forecast: HourlyForecast, isoDate: string, time: string): HourWeather | null {
  const hour = `${time.slice(0, 2)}:00`;
  const index = forecast.hourly.time.indexOf(`${isoDate}T${hour}`);
  const temperature = index >= 0 ? forecast.hourly.temperature_2m[index] : null;
  if (index < 0 || temperature == null) return null;
  return {
    hour,
    temperature,
    precipitationProbability: forecast.hourly.precipitation_probability[index],
    weatherCode: forecast.hourly.weather_code[index],
    windSpeed: forecast.hourly.wind_speed_10m[index],
  };
}

// WMO weather interpretation codes used by Open-Meteo.
export function describeWeatherCode(code: number): string {
  if (code === 0) return "ясно";
  if (code === 1) return "преимущественно ясно";
  if (code === 2) return "переменная облачность";
  if (code === 3) return "пасмурно";
  if (code === 45 || code === 48) return "туман";
  if (code >= 51 && code <= 57) return "морось";
  if (code >= 61 && code <= 67) return "дождь";
  if (code >= 71 && code <= 77) return "снег";
  if (code >= 80 && code <= 82) return "ливень";
  if (code === 85 || code === 86) return "снегопад";
  if (code >= 95) return "гроза";
  return "без осадков";
}

// "Погода к 09:00: +12°C, пасмурно, ветер 4 м/с, осадки 20%".
export function formatWeather(w: HourWeather): string {
  const t = Math.round(w.temperature);
  const parts = [`${t > 0 ? "+" : ""}${t}°C`];
  if (w.weatherCode != null) parts.push(describeWeatherCode(w.weatherCode));
  if (w.windSpeed != null) parts.push(`ветер ${Math.round(w.windSpeed)} м/с`);
  if (w.precipitationProbability != null) parts.push(`осадки ${w.precipitationProbability}%`);
  return `Погода к ${w.hour}: ${parts.join(", ")}`;
}
