import { fetchJson, url } from '../http.js';
import type { LocationConfig, Surf } from '../../../shared/types.js';

const ENDPOINT = process.env.MAGIC_MARINE_URL ?? 'https://marine-api.open-meteo.com/v1/marine';

interface MarineResponse {
  current?: {
    wave_height?: number | null;
    wave_period?: number | null;
    wave_direction?: number | null;
    swell_wave_height?: number | null;
    swell_wave_period?: number | null;
    sea_surface_temperature?: number | null;
  };
}

/**
 * Marine coverage is a coastal grid: an inland set of coordinates gets a 400
 * rather than nulls, so this source is opt-in per household.
 */
export async function fetchSurf(location: LocationConfig, timezone: string): Promise<Surf> {
  const endpoint = url(ENDPOINT, {
    latitude: location.latitude,
    longitude: location.longitude,
    timezone,
    current: [
      'wave_height',
      'wave_period',
      'wave_direction',
      'swell_wave_height',
      'swell_wave_period',
      'sea_surface_temperature',
    ],
  });

  const data = await fetchJson<MarineResponse>(endpoint);
  const c = data.current ?? {};

  return {
    waveHeight: num(c.wave_height),
    wavePeriod: num(c.wave_period),
    waveDirection: num(c.wave_direction),
    swellHeight: num(c.swell_wave_height),
    swellPeriod: num(c.swell_wave_period),
    seaTemperature: num(c.sea_surface_temperature),
  };
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}
