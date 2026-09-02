/**
 * A deliberately small iCalendar reader.
 *
 * It covers what household calendars actually contain — timed and all-day
 * events, the common RRULE shapes, EXDATE, and per-occurrence overrides — and
 * stops there. Notably it does not read VTIMEZONE definitions: a TZID it does
 * not recognise is resolved against the household timezone, which is the right
 * answer for a family calendar and a wrong one for a globe-trotting work feed.
 */

export interface RawEvent {
  uid: string;
  summary: string;
  location: string | null;
  /** UTC milliseconds. */
  start: number;
  /** UTC milliseconds; null when the event has no duration. */
  end: number | null;
  allDay: boolean;
  rrule: string | null;
  exdates: number[];
  /** Set on an override that replaces one occurrence of a recurring event. */
  recurrenceId: number | null;
}

export interface Occurrence {
  uid: string;
  summary: string;
  location: string | null;
  start: number;
  end: number | null;
  allDay: boolean;
}

interface Line {
  name: string;
  params: Record<string, string>;
  value: string;
}

/* ------------------------------------------------------------------ */
/* Timezone helpers                                                    */
/* ------------------------------------------------------------------ */

const offsetCache = new Map<string, number>();

/** Milliseconds to add to a UTC instant to get wall-clock time in `tz`. */
function zoneOffset(instant: number, tz: string): number {
  const bucket = Math.floor(instant / 3_600_000);
  const key = `${tz}:${bucket}`;
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(instant))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  // Intl renders hour 24 for midnight in some locales/engines.
  const hour = parts.hour === 24 ? 0 : (parts.hour ?? 0);
  const asUtc = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    hour,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  const offset = asUtc - instant;
  offsetCache.set(key, offset);
  return offset;
}

/** Turn a wall-clock time in `tz` into a UTC instant. */
export function wallToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): number {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  // One correction pass resolves the ordinary case; a second settles times
  // that sit near a DST transition.
  let utc = wall - zoneOffset(wall, tz);
  utc = wall - zoneOffset(utc, tz);
  return utc;
}

/* ------------------------------------------------------------------ */
/* Lexing                                                              */
/* ------------------------------------------------------------------ */

/** Undo RFC 5545 line folding, where a continuation starts with a space or tab. */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseLine(line: string): Line | null {
  const colon = findValueColon(line);
  if (colon < 0) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments = head.split(';');
  const name = (segments[0] ?? '').toUpperCase();

  const params: Record<string, string> = {};
  for (const seg of segments.slice(1)) {
    const eq = seg.indexOf('=');
    if (eq < 0) continue;
    params[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

/** The first colon outside a quoted parameter value separates name from value. */
function findValueColon(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) return i;
  }
  return -1;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Date values                                                         */
/* ------------------------------------------------------------------ */

interface ParsedDate {
  ms: number;
  allDay: boolean;
}

function parseDateValue(line: Line, tz: string): ParsedDate | null {
  const v = line.value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    // All-day events are anchored to local midnight so they land on the right
    // row of the agenda regardless of the viewer's offset.
    return { ms: wallToUtc(+y!, +mo!, +d!, 0, 0, 0, tz), allDay: true };
  }

  const stamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!stamp) return null;
  const [, y, mo, d, h, mi, s, z] = stamp;

  if (z) return { ms: Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!), allDay: false };

  const zone = resolveTzid(line.params.TZID, tz);
  return { ms: wallToUtc(+y!, +mo!, +d!, +h!, +mi!, +s!, zone), allDay: false };
}

/** Fall back to the household timezone for TZIDs this runtime cannot resolve. */
function resolveTzid(tzid: string | undefined, fallback: string): string {
  if (!tzid) return fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tzid });
    return tzid;
  } catch {
    return fallback;
  }
}

function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value.trim(),
  );
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    (Number(w ?? 0) * 604800 +
      Number(d ?? 0) * 86400 +
      Number(h ?? 0) * 3600 +
      Number(mi ?? 0) * 60 +
      Number(s ?? 0)) *
    1000;
  return sign === '-' ? -ms : ms;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export function parseIcs(text: string, tz: string): RawEvent[] {
  const events: RawEvent[] = [];
  let current: Partial<RawEvent> & { exdates: number[]; durationMs?: number | null } = {
    exdates: [],
  };
  let inEvent = false;

  for (const rawLine of unfold(text)) {
    const line = parseLine(rawLine);
    if (!line) continue;

    if (line.name === 'BEGIN' && line.value === 'VEVENT') {
      inEvent = true;
      current = { exdates: [] };
      continue;
    }
    if (line.name === 'END' && line.value === 'VEVENT') {
      inEvent = false;
      const finished = finishEvent(current);
      if (finished) events.push(finished);
      continue;
    }
    if (!inEvent) continue;

    switch (line.name) {
      case 'UID':
        current.uid = line.value.trim();
        break;
      case 'SUMMARY':
        current.summary = unescapeText(line.value);
        break;
      case 'LOCATION': {
        const loc = unescapeText(line.value);
        current.location = loc.length > 0 ? loc : null;
        break;
      }
      case 'DTSTART': {
        const parsed = parseDateValue(line, tz);
        if (parsed) {
          current.start = parsed.ms;
          current.allDay = parsed.allDay;
        }
        break;
      }
      case 'DTEND': {
        const parsed = parseDateValue(line, tz);
        if (parsed) current.end = parsed.ms;
        break;
      }
      case 'DURATION':
        current.durationMs = parseDuration(line.value);
        break;
      case 'RRULE':
        current.rrule = line.value.trim();
        break;
      case 'EXDATE': {
        for (const piece of line.value.split(',')) {
          const parsed = parseDateValue({ ...line, value: piece }, tz);
          if (parsed) current.exdates.push(parsed.ms);
        }
        break;
      }
      case 'RECURRENCE-ID': {
        const parsed = parseDateValue(line, tz);
        if (parsed) current.recurrenceId = parsed.ms;
        break;
      }
      default:
        break;
    }
  }

  return events;
}

function finishEvent(
  c: Partial<RawEvent> & { exdates: number[]; durationMs?: number | null },
): RawEvent | null {
  if (typeof c.start !== 'number' || Number.isNaN(c.start)) return null;

  let end = c.end ?? null;
  if (end === null && typeof c.durationMs === 'number') end = c.start + c.durationMs;

  return {
    uid: c.uid ?? `anon-${c.start}`,
    summary: c.summary ?? '(no title)',
    location: c.location ?? null,
    start: c.start,
    end,
    allDay: c.allDay ?? false,
    rrule: c.rrule ?? null,
    exdates: c.exdates,
    recurrenceId: c.recurrenceId ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Recurrence                                                          */
/* ------------------------------------------------------------------ */

interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count: number | null;
  until: number | null;
  byDay: string[];
  byMonthDay: number[];
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function parseRrule(rrule: string, tz: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const piece of rrule.split(';')) {
    const eq = piece.indexOf('=');
    if (eq > 0) parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1);
  }

  const freq = parts.FREQ?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    return null;
  }

  let until: number | null = null;
  if (parts.UNTIL) {
    const parsed = parseDateValue({ name: 'UNTIL', params: {}, value: parts.UNTIL }, tz);
    until = parsed ? parsed.ms : null;
  }

  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until,
    byDay: parts.BYDAY ? parts.BYDAY.split(',').map((d) => d.trim().toUpperCase()) : [],
    byMonthDay: parts.BYMONTHDAY
      ? parts.BYMONTHDAY.split(',')
          .map((d) => Number(d))
          .filter(Number.isFinite)
      : [],
  };
}

/**
 * Expand every event in `events` into concrete occurrences overlapping
 * [windowStart, windowEnd).
 */
export function expand(
  events: RawEvent[],
  windowStart: number,
  windowEnd: number,
  tz: string,
): Occurrence[] {
  // Overrides win over the generated occurrence they replace.
  const overrides = new Map<string, RawEvent>();
  for (const ev of events) {
    if (ev.recurrenceId !== null) overrides.set(`${ev.uid}@${ev.recurrenceId}`, ev);
  }

  const out: Occurrence[] = [];

  for (const ev of events) {
    if (ev.recurrenceId !== null) continue;

    const duration = ev.end !== null ? Math.max(0, ev.end - ev.start) : 0;
    const starts = ev.rrule
      ? expandRule(ev, ev.rrule, windowStart, windowEnd, duration, tz)
      : [ev.start];

    for (const start of starts) {
      if (ev.exdates.includes(start)) continue;

      const override = overrides.get(`${ev.uid}@${start}`);
      const source = override ?? ev;
      const actualStart = override ? override.start : start;
      const actualEnd = override
        ? override.end
        : ev.end !== null
          ? start + duration
          : null;

      if (actualStart >= windowEnd) continue;
      if ((actualEnd ?? actualStart) < windowStart) continue;

      out.push({
        uid: ev.uid,
        summary: source.summary,
        location: source.location,
        start: actualStart,
        end: actualEnd,
        allDay: source.allDay,
      });
    }
  }

  return out.sort((a, b) => a.start - b.start);
}

/** Hard ceiling so a malformed or unbounded rule cannot spin the poller. */
const MAX_STEPS = 3000;

function expandRule(
  ev: RawEvent,
  rrule: string,
  windowStart: number,
  windowEnd: number,
  duration: number,
  tz: string,
): number[] {
  const rule = parseRrule(rrule, tz);
  // An unparseable rule still has its first occurrence, which beats dropping
  // the event off the agenda entirely.
  if (!rule) return [ev.start];

  const limit = Math.min(windowEnd, rule.until ?? windowEnd);
  const out: number[] = [];
  let emitted = 0;

  const first = fields(ev.start, tz);
  let cursor = ev.start;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (cursor > limit) break;
    if (rule.count !== null && emitted >= rule.count) break;

    const candidates =
      rule.freq === 'WEEKLY' && rule.byDay.length > 0
        ? weekCandidates(cursor, rule.byDay, tz)
        : rule.freq === 'MONTHLY' && (rule.byDay.length > 0 || rule.byMonthDay.length > 0)
          ? monthCandidates(cursor, rule, tz)
          : [cursor];

    for (const candidate of candidates) {
      if (candidate < ev.start) continue;
      if (rule.until !== null && candidate > rule.until) continue;
      if (rule.count !== null && emitted >= rule.count) break;
      emitted += 1;
      if (candidate + duration >= windowStart && candidate < windowEnd) out.push(candidate);
    }

    cursor = advance(cursor, rule, first, tz);
  }

  return out;
}

interface Fields {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  dow: number;
}

function fields(ms: number, tz: string): Fields {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour ?? 0);
  const dow = WEEKDAYS.indexOf((parts.weekday ?? 'SU').slice(0, 2).toUpperCase());
  return {
    y: Number(parts.year ?? 1970),
    mo: Number(parts.month ?? 1),
    d: Number(parts.day ?? 1),
    h: hour,
    mi: Number(parts.minute ?? 0),
    s: Number(parts.second ?? 0),
    dow: dow < 0 ? 0 : dow,
  };
}

/** Step the cursor by one interval, keeping the original wall-clock time. */
function advance(cursor: number, rule: Rule, anchor: Fields, tz: string): number {
  const f = fields(cursor, tz);

  if (rule.freq === 'DAILY') {
    return wallToUtc(f.y, f.mo, f.d + rule.interval, anchor.h, anchor.mi, anchor.s, tz);
  }
  if (rule.freq === 'WEEKLY') {
    return wallToUtc(f.y, f.mo, f.d + 7 * rule.interval, anchor.h, anchor.mi, anchor.s, tz);
  }
  if (rule.freq === 'MONTHLY') {
    return wallToUtc(f.y, f.mo + rule.interval, anchor.d, anchor.h, anchor.mi, anchor.s, tz);
  }
  return wallToUtc(f.y + rule.interval, anchor.mo, anchor.d, anchor.h, anchor.mi, anchor.s, tz);
}

/** For BYDAY weekly rules, every named weekday in the cursor's week. */
function weekCandidates(cursor: number, byDay: string[], tz: string): number[] {
  const f = fields(cursor, tz);
  const sunday = f.d - f.dow;
  const out: number[] = [];
  for (const token of byDay) {
    const idx = WEEKDAYS.indexOf(token.slice(-2));
    if (idx < 0) continue;
    out.push(wallToUtc(f.y, f.mo, sunday + idx, f.h, f.mi, f.s, tz));
  }
  return out.sort((a, b) => a - b);
}

/** For monthly rules, resolve BYMONTHDAY and nth-weekday forms like "2TU". */
function monthCandidates(cursor: number, rule: Rule, tz: string): number[] {
  const f = fields(cursor, tz);
  const out: number[] = [];

  for (const day of rule.byMonthDay) {
    const resolved = day > 0 ? day : daysInMonth(f.y, f.mo) + day + 1;
    out.push(wallToUtc(f.y, f.mo, resolved, f.h, f.mi, f.s, tz));
  }

  for (const token of rule.byDay) {
    const m = /^(-?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token);
    if (!m) continue;
    const nth = m[1] ? Number(m[1]) : 1;
    const target = WEEKDAYS.indexOf(m[2]!);
    const day = nthWeekdayOfMonth(f.y, f.mo, target, nth, tz);
    if (day !== null) out.push(wallToUtc(f.y, f.mo, day, f.h, f.mi, f.s, tz));
  }

  if (out.length === 0) out.push(cursor);
  return out.sort((a, b) => a - b);
}

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

function nthWeekdayOfMonth(
  y: number,
  mo: number,
  weekday: number,
  nth: number,
  tz: string,
): number | null {
  const total = daysInMonth(y, mo);
  const matches: number[] = [];
  for (let d = 1; d <= total; d += 1) {
    if (fields(wallToUtc(y, mo, d, 12, 0, 0, tz), tz).dow === weekday) matches.push(d);
  }
  const picked = nth > 0 ? matches[nth - 1] : matches[matches.length + nth];
  return picked ?? null;
}
