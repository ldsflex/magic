import { fetchJson, url } from '../http.js';
import { describe, iconFor, uvBand } from './wmo.js';
import type { LocationConfig, Weather, WeatherDay, WeatherHour } from '../../../shared/types.js';

/**
 * Open-Meteo needs no API key and no attribution beacon, which makes it the
 * right default for a screen that runs unattended for months. The base URL is
 * overridable for self-hosted instances.
 */
const ENDPOINT = process.env.MAGIC_WEATHER_URL ?? 'https://api.open-meteo.com/v1/forecast';

interface OpenMeteoResponse {
  current?: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    is_day: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    relative_humidity_2m: number;
    uv_index: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: (number | null)[];
    weather_code: number[];
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
    precipitation_sum: (number | null)[];
    uv_index_max: (number | null)[];
    sunrise: string[];
    sunset: string[];
  };
}

export async function fetchWeather(location: LocationConfig, timezone: string): Promise<Weather> {
  const endpoint = url(ENDPOINT, {
    latitude: location.latitude,
    longitude: location.longitude,
    timezone,
    forecast_days: 7,
    current: [
      'temperature_2m',
      'apparent_temperature',
      'is_day',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'relative_humidity_2m',
      'uv_index',
    ],
    hourly: ['temperature_2m', 'precipitation_probability', 'weather_code'],
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'precipitation_sum',
      'uv_index_max',
      'sunrise',
      'sunset',
    ],
  });

  const data = await fetchJson<OpenMeteoResponse>(endpoint);
  const current = data.current;
  if (!current) throw new Error('open-meteo returned no current conditions');

  const isDay = current.is_day === 1;

  return {
    now: {
      temperature: round(current.temperature_2m),
      apparentTemperature: round(current.apparent_temperature),
      code: current.weather_code,
      description: describe(current.weather_code),
      icon: iconFor(current.weather_code, isDay),
      isDay,
      windSpeed: round(current.wind_speed_10m),
      windDirection: current.wind_direction_10m,
      humidity: round(current.relative_humidity_2m),
      uvIndex: round(current.uv_index, 1),
      uvBand: uvBand(current.uv_index),
    },
    hourly: buildHourly(data),
    daily: buildDaily(data),
  };
}

/** Hours from now forwards — the screen never wants this morning at 4pm. */
function buildHourly(data: OpenMeteoResponse): WeatherHour[] {
  const h = data.hourly;
  if (!h) return [];
  const now = Date.now();
  const out: WeatherHour[] = [];

  for (let i = 0; i < h.time.length; i += 1) {
    const time = h.time[i]!;
    // Open-Meteo returns local wall-clock stamps without an offset; compare on
    // the same basis by parsing them as local time.
    if (new Date(time).getTime() < now - 60 * 60 * 1000) continue;
    const code = h.weather_code[i] ?? 0;
    out.push({
      time,
      temperature: round(h.temperature_2m[i] ?? 0),
      precipitationProbability: h.precipitation_probability[i] ?? 0,
      code,
      icon: iconFor(code, isDaylightHour(time)),
    });
    if (out.length >= 24) break;
  }
  return out;
}

function buildDaily(data: OpenMeteoResponse): WeatherDay[] {
  const d = data.daily;
  if (!d) return [];
  return d.time.map((date, i) => {
    const code = d.weather_code[i] ?? 0;
    return {
      date,
      min: round(d.temperature_2m_min[i] ?? 0),
      max: round(d.temperature_2m_max[i] ?? 0),
      code,
      icon: iconFor(code, true),
      description: describe(code),
      precipitationProbability: d.precipitation_probability_max[i] ?? 0,
      precipitationSum: round(d.precipitation_sum[i] ?? 0, 1),
      uvIndexMax: round(d.uv_index_max[i] ?? 0, 1),
      sunrise: d.sunrise[i] ?? '',
      sunset: d.sunset[i] ?? '',
    };
  });
}

/** Good enough for picking a sun or moon glyph on an hourly strip. */
function isDaylightHour(isoLocal: string): boolean {
  const hour = Number(isoLocal.slice(11, 13));
  return hour >= 6 && hour < 19;
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
