import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DashboardConfig } from '../../shared/types.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from wherever this file ended up (src/ in dev, dist/server/src in a
 * build) until we find the repo root, identified by its config directory.
 */
function findRoot(): string {
  let dir = here;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(dir, 'config/dashboard.json'))) return dir;
    dir = resolve(dir, '..');
  }
  throw new Error('could not locate config/dashboard.json above ' + here);
}

export const ROOT = findRoot();
export const CONFIG_PATH = process.env.MAGIC_CONFIG
  ? resolve(process.env.MAGIC_CONFIG)
  : resolve(ROOT, 'config/dashboard.json');

export const DATA_DIR = process.env.MAGIC_DATA_DIR
  ? resolve(process.env.MAGIC_DATA_DIR)
  : resolve(ROOT, 'data');

export const WEB_DIST = resolve(ROOT, 'web/dist');

export const PORT = Number(process.env.PORT ?? 8080);
export const HOST = process.env.HOST ?? '0.0.0.0';

let cached: DashboardConfig | null = null;

export function loadConfig(force = false): DashboardConfig {
  if (cached && !force) return cached;
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw) as DashboardConfig;
  cached = withDefaults(parsed);
  return cached;
}

/**
 * The config file is hand-edited, so treat every optional branch as missing
 * rather than trusting its shape.
 */
function withDefaults(c: Partial<DashboardConfig>): DashboardConfig {
  const sources = c.sources ?? ({} as DashboardConfig['sources']);
  return {
    household: {
      name: c.household?.name ?? 'Home',
      timezone: c.household?.timezone ?? 'UTC',
      locale: c.household?.locale ?? 'en-AU',
      people: c.household?.people ?? [],
    },
    location: {
      name: c.location?.name ?? 'Home',
      latitude: c.location?.latitude ?? 0,
      longitude: c.location?.longitude ?? 0,
    },
    display: {
      orientation: c.display?.orientation ?? 'landscape',
      nightMode: {
        enabled: c.display?.nightMode?.enabled ?? false,
        from: c.display?.nightMode?.from ?? '22:00',
        to: c.display?.nightMode?.to ?? '06:00',
        dim: c.display?.nightMode?.dim ?? 0.5,
      },
      burnInShift: c.display?.burnInShift ?? true,
      rotateSeconds: c.display?.rotateSeconds ?? 12,
    },
    layout: {
      columns: c.layout?.columns ?? '1fr 1fr',
      rows: c.layout?.rows ?? 'auto 1fr auto',
      areas: c.layout?.areas ?? ['hero aside', 'agenda aside', 'ticker ticker'],
    },
    widgets: c.widgets ?? [],
    sources: {
      weather: { enabled: sources.weather?.enabled ?? true, refreshMinutes: sources.weather?.refreshMinutes ?? 10 },
      surf: { enabled: sources.surf?.enabled ?? false, refreshMinutes: sources.surf?.refreshMinutes ?? 30 },
      calendar: {
        enabled: sources.calendar?.enabled ?? true,
        refreshMinutes: sources.calendar?.refreshMinutes ?? 15,
        feeds: sources.calendar?.feeds ?? [],
      },
      news: {
        enabled: sources.news?.enabled ?? true,
        refreshMinutes: sources.news?.refreshMinutes ?? 20,
        feeds: sources.news?.feeds ?? [],
      },
      bins: {
        enabled: sources.bins?.enabled ?? false,
        anchorDate: sources.bins?.anchorDate ?? '1970-01-01',
        anchorBins: sources.bins?.anchorBins ?? ['general'],
        cadenceDays: sources.bins?.cadenceDays ?? 7,
        alternating: sources.bins?.alternating ?? [],
        remindFromHour: sources.bins?.remindFromHour ?? 16,
      },
      compliments: {
        enabled: sources.compliments?.enabled ?? false,
        file: sources.compliments?.file ?? '',
      },
    },
  };
}
