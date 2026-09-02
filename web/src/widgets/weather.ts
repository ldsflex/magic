import { el, replace } from '../dom.js';
import { compass, hour, weekday } from '../format.js';
import { dropIcon, weatherIcon } from '../icons.js';
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
    { class: 'widget widget-weather panel' },
    el(
      'header',
      { class: 'wx-now' },
      icon,
      el('div', { class: 'wx-now-text' }, el('div', { class: 'wx-headline' }, temp, summary), meta),
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
      replace(icon, weatherIcon(now.code, now.isDay));
      temp.textContent = `${Math.round(now.temperature)}°`;
      summary.textContent = now.description;

      const parts = [`Feels ${Math.round(now.apparentTemperature)}°`];
      parts.push(`${Math.round(now.windSpeed)} km/h ${compass(now.windDirection)}`);
      replace(
        meta,
        ...parts.map((p) => el('span', { text: p })),
        // UV is advice, not trivia, so it gets its own emphasis and colour.
        now.isDay
          ? el('span', {
              class: 'wx-uv',
              text: `UV ${now.uvIndex} ${now.uvBand}`,
              dataset: { band: now.uvBand.replace(' ', '-') },
            })
          : null,
      );

      // Baselines stay flat here on purpose: an earlier version offset each
      // reading by its place in the range to trace a curve, but over eight
      // points and a few degrees it read as broken alignment, not a shape.
      replace(
        strip,
        ...weather.hourly.slice(0, hours).map((h) =>
          el(
            'div',
            { class: 'wx-hour' },
            el('span', { class: 'wx-hour-label', text: hour(h.time) }),
            el('span', { class: 'wx-hour-icon' }, weatherIcon(h.code, isDaylight(h.time))),
            el('span', { class: 'wx-hour-temp', text: `${Math.round(h.temperature)}°` }),
            h.precipitationProbability >= 20
              ? el(
                  'span',
                  { class: 'wx-hour-rain' },
                  dropIcon(),
                  `${h.precipitationProbability}`,
                )
              : el('span', { class: 'wx-hour-rain is-empty' }),
          ),
        ),
      );

      // Skip today: the block above already covers it in more detail.
      const upcoming = weather.daily.slice(1, days + 1);
      const bounds = dayBounds(upcoming);

      replace(
        forecast,
        ...upcoming.map((d) =>
          el(
            'div',
            { class: 'wx-day' },
            el('span', { class: 'wx-day-name', text: weekday(`${d.date}T12:00:00`) }),
            el('span', { class: 'wx-day-icon' }, weatherIcon(d.code, true)),
            d.precipitationProbability >= 20
              ? el('span', { class: 'wx-day-rain' }, dropIcon(), `${d.precipitationProbability}`)
              : el('span', { class: 'wx-day-rain is-empty' }),
            el('span', { class: 'wx-day-min', text: `${Math.round(d.min)}°` }),
            // A range bar makes a warm day legible without reading the numbers.
            el(
              'span',
              { class: 'wx-day-track' },
              el('span', {
                class: 'wx-day-bar',
                style: {
                  left: `${pct(d.min, bounds)}%`,
                  right: `${100 - pct(d.max, bounds)}%`,
                },
              }),
            ),
            el('span', { class: 'wx-day-max', text: `${Math.round(d.max)}°` }),
          ),
        ),
      );
    },
  };
};

interface Bounds {
  low: number;
  high: number;
}

function dayBounds(days: Array<{ min: number; max: number }>): Bounds {
  if (days.length === 0) return { low: 0, high: 1 };
  const low = Math.min(...days.map((d) => d.min));
  const high = Math.max(...days.map((d) => d.max));
  return { low, high: high === low ? low + 1 : high };
}

function pct(value: number, bounds: Bounds): number {
  return ((value - bounds.low) / (bounds.high - bounds.low)) * 100;
}

/** Good enough for picking a sun or moon glyph on an hourly strip. */
function isDaylight(isoLocal: string): boolean {
  const h = Number(isoLocal.slice(11, 13));
  return h >= 6 && h < 19;
}
