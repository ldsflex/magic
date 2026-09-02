import { el, replace } from '../dom.js';
import type { Widget, WidgetFactory } from './types.js';

export const listWidget: WidgetFactory = (ctx): Widget => {
  const listId = ctx.option.string('listId', 'shopping');
  const title = ctx.option.string('title', 'List');
  const max = ctx.option.number('max', 10);

  const count = el('span', { class: 'widget-count' });
  const body = el('ul', { class: 'list-body' });
  const empty = el('p', { class: 'widget-empty', text: 'All clear.' });
  const more = el('p', { class: 'list-more' });

  const root = el(
    'section',
    { class: 'widget widget-list' },
    el('h2', { class: 'widget-title' }, title, count),
    body,
    empty,
    more,
  );

  return {
    root,
    update(state) {
      const items = (state.lists[listId] ?? []).filter((item) => !item.done);
      count.textContent = items.length > 0 ? String(items.length) : '';
      empty.hidden = items.length > 0;

      replace(
        body,
        ...items.slice(0, max).map((item) =>
          el(
            'li',
            { class: 'list-item' },
            el('span', { class: 'list-bullet', 'aria-hidden': 'true' }),
            el('span', { class: 'list-text', text: item.text }),
            item.addedBy ? el('span', { class: 'list-by', text: item.addedBy }) : null,
          ),
        ),
      );

      const hidden = Math.max(0, items.length - max);
      more.textContent = hidden > 0 ? `+${hidden} more` : '';
      more.hidden = hidden === 0;
    },
  };
};
