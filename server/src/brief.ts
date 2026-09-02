import { binLabel } from './sources/bins.js';
import { isWet } from './sources/wmo.js';
import type {
  AgendaEvent,
  BinNight,
  Brief,
  DashboardConfig,
  ListItem,
  Mood,
  Reminder,
  Weather,
} from '../../shared/types.js';

interface BriefInput {
  config: DashboardConfig;
  weather: Weather | null;
  agenda: AgendaEvent[];
  reminders: Reminder[];
  lists: Record<string, ListItem[]>;
  bins: BinNight | null;
  now?: Date;
}

/**
 * The one line you read if you read nothing else on the screen.
 *
 * This is deliberately deterministic rather than model-generated: it runs every
 * few seconds on a Pi, it must never be wrong about a time, and it has to work
 * when the house internet is down.
 */
export function buildBrief(input: BriefInput): Brief {
  const now = input.now ?? new Date();
  const tz = input.config.household.timezone;
  const locale = input.config.household.locale;

  const lines: string[] = [];
  let mood: Mood = 'calm';

  /* Bins first — it is the one thing with a hard deadline you cannot redo. */
  if (input.bins?.imminent) {
    const names = input.bins.bins.map(binLabel).join(' + ');
    lines.push(`Bins out tonight: ${names}`);
    mood = 'alert';
  }

  /* Overdue reminders. */
  const overdue = input.reminders.filter(
    (r) => !r.done && r.dueAt !== null && Date.parse(r.dueAt) <= now.getTime(),
  );
  if (overdue.length === 1) {
    lines.push(`Overdue: ${overdue[0]!.text}`);
    mood = raise(mood, 'warn');
  } else if (overdue.length > 1) {
    lines.push(`${overdue.length} reminders overdue`);
    mood = raise(mood, 'warn');
  }

  /* Next event, if it is close enough to matter. */
  const next = input.agenda.find((e) => Date.parse(e.end ?? e.start) >= now.getTime());
  if (next) {
    const start = new Date(next.start);
    const sameDay = isSameLocalDay(start, now, tz);
    if (sameDay) {
      lines.push(
        next.allDay
          ? `Today: ${next.title}`
          : `${formatTime(start, tz, locale)} — ${next.title}`,
      );
    } else if (withinDays(start, now, 1, tz)) {
      lines.push(
        next.allDay
          ? `Tomorrow: ${next.title}`
          : `Tomorrow ${formatTime(start, tz, locale)} — ${next.title}`,
      );
    }
  }

  /* Weather, as advice rather than numbers. */
  if (input.weather) {
    const today = input.weather.daily[0];
    const rainSoon = input.weather.hourly
      .slice(0, 6)
      .find((h) => h.precipitationProbability >= 60 || isWet(h.code));

    if (rainSoon) {
      lines.push(`Rain likely around ${formatTime(new Date(rainSoon.time), tz, locale)}`);
      mood = raise(mood, 'wet');
    } else if (today && today.precipitationProbability >= 60) {
      lines.push(`${today.precipitationProbability}% chance of rain today`);
      mood = raise(mood, 'wet');
    }

    const uv = Math.max(input.weather.now.uvIndex, today?.uvIndexMax ?? 0);
    if (uv >= 8 && input.weather.now.isDay) {
      lines.push(`UV ${Math.round(uv)} — ${uvAdvice(uv)}`);
      mood = raise(mood, 'warn');
    }
  }

  /* Shopping only gets a mention when it is worth a trip. */
  const shopping = (input.lists.shopping ?? []).filter((i) => !i.done);
  if (shopping.length >= 5) {
    lines.push(`${shopping.length} things on the shopping list`);
  }

  return { headline: headlineFor(lines, input, now, tz, locale), lines: lines.slice(0, 4), mood };
}

function headlineFor(
  lines: string[],
  input: BriefInput,
  now: Date,
  tz: string,
  locale: string,
): string {
  if (lines.length > 0) return lines[0]!;

  if (input.weather) {
    const today = input.weather.daily[0];
    const w = input.weather.now;
    if (today) {
      return `${w.description}, ${Math.round(w.temperature)}° now and up to ${Math.round(today.max)}° today.`;
    }
    return `${w.description}, ${Math.round(w.temperature)}°.`;
  }

  return `${greeting(now, tz)} — ${formatDate(now, tz, locale)}.`;
}

function uvAdvice(uv: number): string {
  if (uv >= 11) return 'stay in the shade';
  if (uv >= 8) return 'hat and sunscreen';
  return 'sunscreen';
}

function greeting(now: Date, tz: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(now),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatTime(date: Date, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDate(date: Date, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function localDayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function isSameLocalDay(a: Date, b: Date, tz: string): boolean {
  return localDayKey(a, tz) === localDayKey(b, tz);
}

function withinDays(target: Date, now: Date, days: number, tz: string): boolean {
  const shifted = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return localDayKey(target, tz) === localDayKey(shifted, tz);
}

const ORDER: Mood[] = ['calm', 'wet', 'warn', 'alert'];

/** Moods only ever escalate, so the tint reflects the worst thing on screen. */
function raise(current: Mood, next: Mood): Mood {
  return ORDER.indexOf(next) > ORDER.indexOf(current) ? next : current;
}
