import { el, replace } from '../dom.js';
import type { Widget, WidgetFactory } from './types.js';

export const briefWidget: WidgetFactory = (): Widget => {
  const headline = el('p', { class: 'brief-headline' });
  const detail = el('ul', { class: 'brief-detail' });
  const root = el('section', { class: 'widget widget-brief' }, headline, detail);

  return {
    root,
    update(state) {
      headline.textContent = state.brief.headline;
      // The headline is always lines[0]; repeating it below adds nothing.
      const rest = state.brief.lines.slice(1);
      replace(detail, ...rest.map((line) => el('li', { text: line })));
      root.dataset.mood = state.brief.mood;
      detail.classList.toggle('is-empty', rest.length === 0);
    },
  };
};
