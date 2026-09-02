import { el, replace } from '../dom.js';
import { compass } from '../format.js';
import type { Widget, WidgetFactory } from './types.js';

export const surfWidget: WidgetFactory = (): Widget => {
  const body = el('div', { class: 'surf-body' });
  const root = el(
    'section',
    { class: 'widget widget-surf' },
    el('h2', { class: 'widget-title', text: 'Surf' }),
    body,
  );

  return {
    root,
    update(state) {
      const surf = state.surf;
      // Hide rather than show an empty panel: inland households never get data.
      if (!surf || surf.waveHeight === null) {
        root.hidden = true;
        return;
      }
      root.hidden = false;

      const stats: Array<[string, string]> = [
        ['Wave', `${surf.waveHeight.toFixed(1)} m`],
      ];
      if (surf.wavePeriod !== null) stats.push(['Period', `${Math.round(surf.wavePeriod)} s`]);
      if (surf.waveDirection !== null) stats.push(['Dir', compass(surf.waveDirection)]);
      if (surf.seaTemperature !== null) stats.push(['Sea', `${Math.round(surf.seaTemperature)}°`]);

      replace(
        body,
        ...stats.map(([label, value]) =>
          el(
            'div',
            { class: 'surf-stat' },
            el('span', { class: 'surf-stat-value', text: value }),
            el('span', { class: 'surf-stat-label', text: label }),
          ),
        ),
      );
    },
  };
};
