/**
 * WMO 4677 weather codes, as returned by Open-Meteo, reduced to a short label
 * and an icon. Icons are emoji so the dashboard needs no icon font.
 */

interface CodeInfo {
  day: string;
  night: string;
  label: string;
}

const CODES: Record<number, CodeInfo> = {
  0: { day: '☀️', night: '🌙', label: 'Clear' },
  1: { day: '🌤️', night: '🌙', label: 'Mostly clear' },
  2: { day: '⛅', night: '☁️', label: 'Partly cloudy' },
  3: { day: '☁️', night: '☁️', label: 'Overcast' },
  45: { day: '🌫️', night: '🌫️', label: 'Fog' },
  48: { day: '🌫️', night: '🌫️', label: 'Freezing fog' },
  51: { day: '🌦️', night: '🌦️', label: 'Light drizzle' },
  53: { day: '🌦️', night: '🌦️', label: 'Drizzle' },
  55: { day: '🌧️', night: '🌧️', label: 'Heavy drizzle' },
  56: { day: '🌧️', night: '🌧️', label: 'Freezing drizzle' },
  57: { day: '🌧️', night: '🌧️', label: 'Freezing drizzle' },
  61: { day: '🌦️', night: '🌦️', label: 'Light rain' },
  63: { day: '🌧️', night: '🌧️', label: 'Rain' },
  65: { day: '🌧️', night: '🌧️', label: 'Heavy rain' },
  66: { day: '🌧️', night: '🌧️', label: 'Freezing rain' },
  67: { day: '🌧️', night: '🌧️', label: 'Freezing rain' },
  71: { day: '🌨️', night: '🌨️', label: 'Light snow' },
  73: { day: '🌨️', night: '🌨️', label: 'Snow' },
  75: { day: '❄️', night: '❄️', label: 'Heavy snow' },
  77: { day: '🌨️', night: '🌨️', label: 'Snow grains' },
  80: { day: '🌦️', night: '🌦️', label: 'Light showers' },
  81: { day: '🌧️', night: '🌧️', label: 'Showers' },
  82: { day: '⛈️', night: '⛈️', label: 'Heavy showers' },
  85: { day: '🌨️', night: '🌨️', label: 'Snow showers' },
  86: { day: '🌨️', night: '🌨️', label: 'Snow showers' },
  95: { day: '⛈️', night: '⛈️', label: 'Thunderstorms' },
  96: { day: '⛈️', night: '⛈️', label: 'Storms with hail' },
  99: { day: '⛈️', night: '⛈️', label: 'Storms with hail' },
};

const UNKNOWN: CodeInfo = { day: '🌡️', night: '🌡️', label: 'Unknown' };

export function describe(code: number): string {
  return (CODES[code] ?? UNKNOWN).label;
}

export function iconFor(code: number, isDay = true): string {
  const info = CODES[code] ?? UNKNOWN;
  return isDay ? info.day : info.night;
}

/** True for codes that mean "you will get wet". */
export function isWet(code: number): boolean {
  return code >= 51;
}

export function uvBand(uv: number): string {
  if (uv < 3) return 'low';
  if (uv < 6) return 'moderate';
  if (uv < 8) return 'high';
  if (uv < 11) return 'very high';
  return 'extreme';
}
