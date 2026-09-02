import { el, replace } from '../dom.js';
import type { NewsItem } from '../../../shared/types.js';
import type { Widget, WidgetFactory } from './types.js';

/**
 * Headlines rotate one at a time rather than scrolling. A moving ticker in
 * peripheral vision is the fastest way to make a room feel restless.
 */
export const newsWidget: WidgetFactory = (ctx): Widget => {
  const max = ctx.option.number('max', 8);
  const rotateMs = Math.max(4, ctx.config.display.rotateSeconds) * 1000;

  const source = el('span', { class: 'news-source' });
  const headline = el('span', { class: 'news-headline' });
  const dots = el('span', { class: 'news-dots' });

  const root = el(
    'section',
    { class: 'widget widget-news' },
    el('div', { class: 'news-line' }, source, headline),
    dots,
  );

  let items: NewsItem[] = [];
  let index = 0;

  const paint = () => {
    const item = items[index];
    if (!item) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    source.textContent = item.source;
    headline.textContent = item.title;

    // Restart the fade so consecutive headlines each get one.
    headline.classList.remove('is-fresh');
    void headline.offsetWidth;
    headline.classList.add('is-fresh');

    replace(
      dots,
      ...items.map((_, i) => el('i', { class: i === index ? 'is-active' : '' })),
    );
  };

  const timer = window.setInterval(() => {
    if (items.length === 0) return;
    index = (index + 1) % items.length;
    paint();
  }, rotateMs);

  return {
    root,
    update(state) {
      const next = state.news.slice(0, max);
      // Keep the current headline up if the feed re-fetched identical items.
      const changed =
        next.length !== items.length || next.some((item, i) => item.id !== items[i]?.id);
      items = next;
      if (changed || index >= items.length) index = 0;
      paint();
    },
    destroy() {
      window.clearInterval(timer);
    },
  };
};
