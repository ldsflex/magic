import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../config.js';
import type { Weather } from '../../../shared/types.js';

type ComplimentFile = Record<string, string[]>;

/**
 * Reads the MagicMirror-style compliments file: keys are time-of-day buckets
 * ("morning", "afternoon", "evening"), weather buckets ("day_sunny", "rain"),
 * or "anytime".
 *
 * Re-read on every pick — it happens a few times an hour, and it means editing
 * the file takes effect without restarting the server.
 */
export function pickCompliment(
  file: string,
  weather: Weather | null,
  timezone: string,
  now = new Date(),
): string | null {
  if (!file) return null;

  let data: ComplimentFile;
  try {
    data = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')) as ComplimentFile;
  } catch {
    // A half-saved file should not take the clock widget down with it.
    return null;
  }

  const pool = [
    ...(data[timeBucket(localHour(now, timezone))] ?? []),
    ...(weather ? (data[weatherBucket(weather)] ?? []) : []),
    ...(data.anytime ?? []),
  ];

  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

/**
 * The household's hour, not the server's. A Pi set to UTC — or a server in
 * another country — would otherwise wish you good morning at dinner time.
 */
function localHour(now: Date, timezone: string): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(now);
    const hour = Number(formatted);
    // Intl renders midnight as hour 24 on some engines.
    if (Number.isFinite(hour)) return hour % 24;
  } catch {
    // An unrecognised timezone throws rather than returning anything, and
    // this runs inside the state build — a typo in config must not take the
    // whole dashboard down with it.
  }
  return now.getHours();
}

function timeBucket(hour: number): string {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** Maps live conditions onto the weather keys MagicMirror configs use. */
function weatherBucket(weather: Weather): string {
  const { code, isDay } = weather.now;
  if (code >= 95) return 'thunderstorm';
  if (code >= 51) return 'rain';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 1 && code <= 3) return isDay ? 'day_cloudy' : 'night_cloudy';
  return isDay ? 'day_sunny' : 'night_clear';
}
