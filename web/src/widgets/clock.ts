import { el, replace } from '../dom.js';
import { clockTime, longDate } from '../format.js';
import type { Widget, WidgetFactory } from './types.js';

export const clockWidget: WidgetFactory = (): Widget => {
  const timeEl = el('div', { class: 'clock-time' });
  const secondsEl = el('span', { class: 'clock-seconds' });
  const dateEl = el('div', { class: 'clock-date' });
  const complimentEl = el('div', { class: 'clock-compliment' });

  const root = el(
    'section',
    { class: 'widget widget-clock' },
    el('div', { class: 'clock-row' }, timeEl, secondsEl),
    dateEl,
    complimentEl,
  );

  const paint = () => {
    const now = new Date();
    timeEl.textContent = clockTime(now);
    secondsEl.textContent = String(now.getSeconds()).padStart(2, '0');
    dateEl.textContent = longDate(now);
  };

  paint();

  return {
    root,
    tick: paint,
    update(state) {
      // Compliments arrive as multi-line strings in MagicMirror configs.
      const lines = (state.compliment ?? '').split('\n').filter((l) => l.trim().length > 0);
      replace(complimentEl, ...lines.map((line) => el('div', { text: line })));
      complimentEl.classList.toggle('is-empty', lines.length === 0);
    },
  };
};
