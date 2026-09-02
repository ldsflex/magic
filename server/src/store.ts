import { EventEmitter } from 'node:events';
import { loadConfig } from './config.js';
import { allLists, allReminders, readCache, writeCache } from './db.js';
import { fetchWeather } from './sources/weather.js';
import { fetchSurf } from './sources/surf.js';
import { fetchAgenda } from './sources/calendar.js';
import { fetchNews } from './sources/news.js';
import { nextBinNight } from './sources/bins.js';
import { pickCompliment } from './sources/compliments.js';
import { buildBrief } from './brief.js';
import type {
  AgendaEvent,
  DashboardState,
  NewsItem,
  SourceHealth,
  Surf,
  Weather,
} from '../../shared/types.js';

type Upstream = 'weather' | 'surf' | 'calendar' | 'news';

interface Slot<T> {
  value: T | null;
  health: SourceHealth;
}

function slot<T>(name: string): Slot<T> {
  return { value: null, health: { name, ok: false, lastSuccess: null, lastError: null } };
}

const upstream = {
  weather: slot<Weather>('weather'),
  surf: slot<Surf>('surf'),
  calendar: slot<AgendaEvent[]>('calendar'),
  news: slot<NewsItem[]>('news'),
};

export const bus = new EventEmitter();
bus.setMaxListeners(50);

/** Timers, kept so a config reload can restart the schedule cleanly. */
const timers = new Set<NodeJS.Timeout>();

let complimentText: string | null = null;
let complimentAt = 0;

/**
 * Sources are cached to disk so a restart — or an outage — still shows the last
 * known weather rather than an empty panel.
 */
function hydrateFromCache(): void {
  for (const key of Object.keys(upstream) as Upstream[]) {
    const cached = readCache<unknown>(`source:${key}`);
    if (!cached) continue;
    (upstream[key] as Slot<unknown>).value = cached.value;
    upstream[key].health.lastSuccess = cached.fetchedAt;
    upstream[key].health.ok = true;
  }
}

/**
 * A loader reports a `warning` when it succeeded but not completely — one of
 * five calendars was unreachable, say. That has to survive the success path, so
 * the source still shows as healthy while naming what is missing.
 */
interface Loaded<T> {
  value: T;
  warning?: string | null;
}

async function refresh<T>(key: Upstream, load: () => Promise<Loaded<T> | T>): Promise<void> {
  const target = upstream[key] as Slot<T>;
  try {
    const result = await load();
    const loaded = (
      typeof result === 'object' && result !== null && 'value' in result
        ? result
        : { value: result }
    ) as Loaded<T>;

    target.value = loaded.value;
    target.health.ok = true;
    target.health.lastSuccess = new Date().toISOString();
    target.health.lastError = loaded.warning ?? null;
    writeCache(`source:${key}`, loaded.value);
  } catch (err) {
    target.health.ok = false;
    target.health.lastError = err instanceof Error ? err.message : String(err);
    // The previous value is left in place on purpose: stale weather beats none.
  }
  publish();
}

interface Job {
  key: Upstream;
  refreshMinutes: number;
  run: () => Promise<void>;
}

/**
 * The set of sources this config actually wants, with the same loaders used for
 * both the initial fetch and the recurring poll.
 */
function jobsFor(config: ReturnType<typeof loadConfig>): Job[] {
  const { household, location, sources } = config;
  const jobs: Job[] = [];

  if (sources.weather.enabled) {
    jobs.push({
      key: 'weather',
      refreshMinutes: sources.weather.refreshMinutes,
      run: () => refresh('weather', () => fetchWeather(location, household.timezone)),
    });
  }

  if (sources.surf.enabled) {
    jobs.push({
      key: 'surf',
      refreshMinutes: sources.surf.refreshMinutes,
      run: () => refresh('surf', () => fetchSurf(location, household.timezone)),
    });
  }

  if (sources.calendar.enabled && sources.calendar.feeds.length > 0) {
    jobs.push({
      key: 'calendar',
      refreshMinutes: sources.calendar.refreshMinutes,
      run: () =>
        refresh('calendar', async () => {
          const { events, errors } = await fetchAgenda(sources.calendar.feeds, household.timezone);
          // Every feed failing is an outage; some failing is a warning.
          if (errors.length > 0 && events.length === 0) throw new Error(errors.join('; '));
          return { value: events, warning: errors.length > 0 ? errors.join('; ') : null };
        }),
    });
  }

  if (sources.news.enabled && sources.news.feeds.length > 0) {
    jobs.push({
      key: 'news',
      refreshMinutes: sources.news.refreshMinutes,
      run: () =>
        refresh('news', async () => {
          const { items, errors } = await fetchNews(sources.news.feeds);
          if (errors.length > 0 && items.length === 0) throw new Error(errors.join('; '));
          return { value: items, warning: errors.length > 0 ? errors.join('; ') : null };
        }),
    });
  }

  return jobs;
}

export async function refreshAll(): Promise<void> {
  await Promise.all(jobsFor(loadConfig()).map((job) => job.run()));
}

export function startPolling(): void {
  stopPolling();
  hydrateFromCache();

  for (const job of jobsFor(loadConfig())) {
    const timer = setInterval(() => void job.run(), Math.max(1, job.refreshMinutes) * 60 * 1000);
    timer.unref();
    timers.add(timer);
  }

  // Recompute the brief on the minute so "Rain at 4pm" stops being true at 4pm.
  const tick = setInterval(publish, 60 * 1000);
  tick.unref();
  timers.add(tick);

  void refreshAll();
}

export function stopPolling(): void {
  for (const timer of timers) clearInterval(timer);
  timers.clear();
}

/** Compliments rotate slowly; re-rolling every publish would make them flicker. */
function currentCompliment(weather: Weather | null): string | null {
  const config = loadConfig();
  if (!config.sources.compliments.enabled) return null;

  const age = Date.now() - complimentAt;
  if (complimentText === null || age > 10 * 60 * 1000) {
    complimentText = pickCompliment(
      config.sources.compliments.file,
      weather,
      config.household.timezone,
    );
    complimentAt = Date.now();
  }
  return complimentText;
}

export function buildState(): DashboardState {
  const config = loadConfig();
  const weather = upstream.weather.value;
  const lists = allLists();
  const reminders = allReminders();
  const agenda = upstream.calendar.value ?? [];
  const bins = nextBinNight(config.sources.bins);

  return {
    generatedAt: new Date().toISOString(),
    compliment: currentCompliment(weather),
    weather,
    surf: upstream.surf.value,
    agenda,
    lists,
    reminders,
    news: upstream.news.value ?? [],
    bins,
    brief: buildBrief({ config, weather, agenda, reminders, lists, bins }),
    health: Object.values(upstream).map((s) => s.health),
  };
}

/** Notify connected screens that something changed. */
export function publish(): void {
  bus.emit('state', buildState());
}
