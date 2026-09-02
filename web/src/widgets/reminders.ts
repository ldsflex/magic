import { el, replace } from '../dom.js';
import { relativeFromNow } from '../format.js';
import type { BinNight } from '../../../shared/types.js';
import type { Widget, WidgetFactory } from './types.js';

const BIN_LABELS: Record<string, string> = {
  general: 'Red',
  recycling: 'Yellow',
  green: 'Green',
};

export const remindersWidget: WidgetFactory = (ctx): Widget => {
  const max = ctx.option.number('max', 6);

  const binBanner = el('div', { class: 'bin-banner' });
  const body = el('ul', { class: 'reminder-body' });
  const empty = el('p', { class: 'widget-empty', text: 'Nothing to do.' });

  const root = el(
    'section',
    { class: 'widget widget-reminders' },
    el('h2', { class: 'widget-title', text: 'Reminders' }),
    binBanner,
    body,
    empty,
  );

  return {
    root,
    update(state) {
      renderBins(binBanner, state.bins);

      const open = state.reminders.filter((r) => !r.done).slice(0, max);
      empty.hidden = open.length > 0 || !binBanner.hidden;

      const now = Date.now();
      replace(
        body,
        ...open.map((reminder) => {
          const overdue = reminder.dueAt !== null && Date.parse(reminder.dueAt) <= now;
          return el(
            'li',
            { class: `reminder-item${overdue ? ' is-overdue' : ''}` },
            el('span', { class: 'reminder-text', text: reminder.text }),
            reminder.assignee ? el('span', { class: 'reminder-who', text: reminder.assignee }) : null,
            reminder.dueAt
              ? el('span', { class: 'reminder-due', text: relativeFromNow(reminder.dueAt, now) })
              : null,
          );
        }),
      );
    },
  };
};

function renderBins(node: HTMLElement, bins: BinNight | null): void {
  if (!bins || !bins.imminent) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  replace(
    node,
    el('span', { class: 'bin-banner-label', text: 'Bins out' }),
    ...bins.bins.map((kind) =>
      el('span', { class: `bin-chip bin-${kind}`, text: BIN_LABELS[kind] ?? kind }),
    ),
  );
}
