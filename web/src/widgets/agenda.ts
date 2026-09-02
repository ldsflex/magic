import { el, replace } from '../dom.js';
import { dayKey, relativeDay, time } from '../format.js';
import type { AgendaEvent } from '../../../shared/types.js';
import type { Widget, WidgetFactory } from './types.js';

export const agendaWidget: WidgetFactory = (ctx): Widget => {
  const days = ctx.option.number('days', 3);
  const maxEvents = ctx.option.number('maxEvents', 8);

  const body = el('div', { class: 'agenda-body' });
  const empty = el('p', { class: 'widget-empty', text: 'Nothing scheduled.' });
  const root = el(
    'section',
    { class: 'widget widget-agenda' },
    el('h2', { class: 'widget-title', text: 'Coming up' }),
    body,
    empty,
  );

  return {
    root,
    update(state) {
      const now = new Date();
      const horizon = new Date(now.getTime() + days * 86_400_000);
      const horizonKey = dayKey(horizon);

      const visible = state.agenda
        .filter((e) => Date.parse(e.end ?? e.start) >= now.getTime())
        .filter((e) => dayKey(e.start) <= horizonKey)
        .slice(0, maxEvents);

      empty.hidden = visible.length > 0;

      const groups = new Map<string, AgendaEvent[]>();
      for (const event of visible) {
        const key = dayKey(event.start);
        const bucket = groups.get(key);
        if (bucket) bucket.push(event);
        else groups.set(key, [event]);
      }

      replace(
        body,
        ...[...groups.entries()].map(([, events]) =>
          el(
            'div',
            { class: 'agenda-day' },
            el('h3', { class: 'agenda-day-label', text: relativeDay(events[0]!.start, now) }),
            ...events.map((event) => renderEvent(event, now)),
          ),
        ),
      );

      // Layout is known only after paint, so trim on the next frame.
      requestAnimationFrame(() => trimOverflow(body));
    },
  };
};

/**
 * Drop whole rows until the list fits. CSS clipping alone leaves half-drawn
 * events and day headers with nothing under them, which reads as a bug.
 */
function trimOverflow(body: HTMLElement): void {
  let guard = 100;
  while (body.scrollHeight > body.clientHeight && guard > 0) {
    guard -= 1;
    const lastDay = body.lastElementChild;
    if (!lastDay) break;

    const lastEvent = lastDay.querySelector('.agenda-event:last-of-type');
    if (lastEvent) lastEvent.remove();
    // A day with no events left has nothing to label.
    if (!lastDay.querySelector('.agenda-event')) lastDay.remove();
  }
}

function renderEvent(event: AgendaEvent, now: Date): HTMLElement {
  const started = Date.parse(event.start) <= now.getTime();

  return el(
    'div',
    { class: `agenda-event${started ? ' is-now' : ''}` },
    el('span', { class: 'agenda-dot', style: { background: event.colour } }),
    el('span', { class: 'agenda-time', text: event.allDay ? 'All day' : time(event.start) }),
    el(
      'span',
      { class: 'agenda-detail' },
      el('span', { class: 'agenda-title', text: event.title }),
      event.location ? el('span', { class: 'agenda-location', text: event.location }) : null,
    ),
  );
}
