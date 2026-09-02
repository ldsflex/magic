import { fetchText } from '../http.js';
import { parseIcs, expand } from './ics.js';
import type { AgendaEvent, CalendarFeed } from '../../../shared/types.js';

const DEFAULT_COLOUR = '#94a3b8';

/** How far ahead to expand. The widget slices this down for display. */
const WINDOW_DAYS = 14;

export async function fetchAgenda(
  feeds: CalendarFeed[],
  timezone: string,
): Promise<{ events: AgendaEvent[]; errors: string[] }> {
  const windowStart = Date.now() - 6 * 60 * 60 * 1000;
  const windowEnd = windowStart + WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const text = await fetchText(normaliseUrl(feed.url), 20_000);
      const raw = parseIcs(text, timezone);
      return expand(raw, windowStart, windowEnd, timezone).map<AgendaEvent>((o) => ({
        id: `${feed.name}:${o.uid}:${o.start}`,
        title: o.summary,
        start: new Date(o.start).toISOString(),
        end: o.end === null ? null : new Date(o.end).toISOString(),
        allDay: o.allDay,
        location: o.location,
        calendar: feed.name,
        colour: feed.colour ?? DEFAULT_COLOUR,
        personId: feed.personId ?? null,
      }));
    }),
  );

  const events: AgendaEvent[] = [];
  const errors: string[] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      events.push(...result.value);
    } else {
      const name = feeds[i]?.name ?? 'calendar';
      errors.push(`${name}: ${errorMessage(result.reason)}`);
    }
  });

  events.sort((a, b) => a.start.localeCompare(b.start));
  return { events, errors };
}

/** Google and Apple hand out `webcal://` links; fetch does not speak it. */
function normaliseUrl(raw: string): string {
  return raw.replace(/^webcal:\/\//i, 'https://');
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
