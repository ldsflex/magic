import { el, replace } from '../dom.js';
import { compass, hour, weekday } from '../format.js';
import type { Widget, WidgetFactory } from './types.js';

export const weatherWidget: WidgetFactory = (ctx): Widget => {
  const hours = ctx.option.number('hours', 8);
  const days = ctx.option.number('days', 4);

  const icon = el('div', { class: 'wx-icon' });
  const temp = el('div', { class: 'wx-temp' });
  const summary = el('div', { class: 'wx-summary' });
  const meta = el('div', { class: 'wx-meta' });
  const strip = el('div', { class: 'wx-hourly' });
  const forecast = el('div', { class: 'wx-daily' });

  const root = el(
    'section',
    { class: 'widget widget-weather' },
    el(
      'header',
      { class: 'wx-now' },
      icon,
      el('div', { class: 'wx-now-text' }, temp, summary, meta),
    ),
    strip,
    forecast,
  );

  return {
    root,
    update(state) {
      const weather = state.weather;
      if (!weather) {
        root.classList.add('is-stale');
        summary.textContent = 'Weather unavailable';
        return;
      }
      root.classList.remove('is-stale');

      const now = weather.now;
      icon.textContent = now.icon;
      temp.textContent = `${Math.round(now.temperature)}°`;
      summary.textContent = now.description;

      const parts = [`Feels ${Math.round(now.apparentTemperature)}°`];
      parts.push(`${Math.round(now.windSpeed)} km/h ${compass(now.windDirection)}`);
      if (now.isDay) parts.push(`UV ${now.uvIndex} ${now.uvBand}`);
      replace(meta, ...parts.map((p) => el('span', { text: p })));
      // Colour the block by UV band so a dangerous day reads across the room.
      meta.dataset.uv = now.isDay ? now.uvBand.replace(' ', '-') : 'night';

      replace(
        strip,
        ...weather.hourly.slice(0, hours).map((h) =>
          el(
            'div',
            { class: 'wx-hour' },
            el('span', { class: 'wx-hour-label', text: hour(h.time) }),
            el('span', { class: 'wx-hour-icon', text: h.icon }),
            el('span', { class: 'wx-hour-temp', text: `${Math.round(h.temperature)}°` }),
            el('span', {
              class: 'wx-hour-rain',
              text: h.precipitationProbability >= 20 ? `${h.precipitationProbability}%` : '',
            }),
          ),
        ),
      );

      // Skip today: the block above already covers it in more detail.
      replace(
        forecast,
        ...weather.daily.slice(1, days + 1).map((d) =>
          el(
            'div',
            { class: 'wx-day' },
            el('span', { class: 'wx-day-name', text: weekday(`${d.date}T12:00:00`) }),
            el('span', { class: 'wx-day-icon', text: d.icon }),
            el(
              'span',
              { class: 'wx-day-rain', text: d.precipitationProbability >= 20 ? `${d.precipitationProbability}%` : '' },
            ),
            el('span', { class: 'wx-day-range' }, `${Math.round(d.min)}° `, el('b', { text: `${Math.round(d.max)}°` })),
          ),
        ),
      );
    },
  };
};
