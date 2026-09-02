import type { DashboardConfig } from '../../shared/types.js';

let locale = 'en-AU';
let timezone = 'UTC';

export function configureFormatting(config: DashboardConfig): void {
  locale = config.household.locale;
  timezone = config.household.timezone;
}

const memo = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timezone}|${JSON.stringify(options)}`;
  let f = memo.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options });
    memo.set(key, f);
  }
  return f;
}

export const time = (d: Date | string): string =>
  formatter({ hour: 'numeric', minute: '2-digit' }).format(toDate(d));

export const hour = (d: Date | string): string =>
  formatter({ hour: 'numeric' }).format(toDate(d));

export const weekday = (d: Date | string): string =>
  formatter({ weekday: 'short' }).format(toDate(d));

export const longDate = (d: Date | string): string =>
  formatter({ weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(d));

export const clockTime = (d: Date): string =>
  formatter({ hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

/** "YYYY-MM-DD" in the household timezone — the key agenda grouping uses. */
export const dayKey = (d: Date | string): string => dayKeyImpl(toDate(d));

function dayKeyImpl(d: Date): string {
  const parts = formatter({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "Today" / "Tomorrow" / weekday name, for agenda day headers. */
export function relativeDay(d: Date | string, now = new Date()): string {
  const target = dayKeyImpl(toDate(d));
  if (target === dayKeyImpl(now)) return 'Today';
  if (target === dayKeyImpl(new Date(now.getTime() + 86_400_000))) return 'Tomorrow';
  return formatter({ weekday: 'long' }).format(toDate(d));
}

export function relativeFromNow(iso: string, now = Date.now()): string {
  const diff = Date.parse(iso) - now;
  const mins = Math.round(diff / 60_000);

  if (mins <= -60 * 24) return `${Math.round(-mins / (60 * 24))}d overdue`;
  if (mins <= -60) return `${Math.round(-mins / 60)}h overdue`;
  if (mins < 0) return `${-mins}m overdue`;
  if (mins < 60) return `in ${mins}m`;
  if (mins < 60 * 24) return `in ${Math.round(mins / 60)}h`;
  return `in ${Math.round(mins / (60 * 24))}d`;
}

export function compass(degrees: number): string {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(degrees / 22.5) % 16] ?? 'N';
}

function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d;
}
