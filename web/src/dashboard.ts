import { el } from './dom.js';
import { agendaWidget } from './widgets/agenda.js';
import { briefWidget } from './widgets/brief.js';
import { clockWidget } from './widgets/clock.js';
import { listWidget } from './widgets/list.js';
import { newsWidget } from './widgets/news.js';
import { remindersWidget } from './widgets/reminders.js';
import { surfWidget } from './widgets/surf.js';
import { makeContext, type Widget, type WidgetFactory } from './widgets/types.js';
import type { DashboardConfig, DashboardState, WidgetType } from '../../shared/types.js';
import { weatherWidget } from './widgets/weather.js';

const FACTORIES: Record<WidgetType, WidgetFactory> = {
  clock: clockWidget,
  brief: briefWidget,
  weather: weatherWidget,
  surf: surfWidget,
  agenda: agendaWidget,
  list: listWidget,
  reminders: remindersWidget,
  news: newsWidget,
};

export interface Dashboard {
  root: HTMLElement;
  update(state: DashboardState): void;
}

export function createDashboard(config: DashboardConfig): Dashboard {
  const widgets: Widget[] = [];
  const areas = new Map<string, HTMLElement>();

  // Every name mentioned in the grid template gets a container, whether or not
  // a widget currently lands in it — an empty cell must not collapse the grid.
  for (const row of config.layout.areas) {
    for (const name of row.trim().split(/\s+/)) {
      if (name === '.' || areas.has(name)) continue;
      areas.set(name, el('div', { class: 'area', style: { gridArea: name } }));
    }
  }

  for (const widgetConfig of config.widgets) {
    const factory = FACTORIES[widgetConfig.type];
    const container = areas.get(widgetConfig.area);
    if (!factory || !container) {
      console.warn(`skipping widget ${widgetConfig.id}: unknown type or area`);
      continue;
    }
    const widget = factory(makeContext(config, widgetConfig));
    widget.root.dataset.widget = widgetConfig.id;
    container.appendChild(widget.root);
    widgets.push(widget);
  }

  const grid = el('main', {
    class: 'grid',
    style: {
      gridTemplateColumns: shrinkable(config.layout.columns),
      gridTemplateRows: shrinkable(config.layout.rows),
      gridTemplateAreas: config.layout.areas.map((row) => `"${row}"`).join(' '),
    },
  });
  for (const area of areas.values()) grid.appendChild(area);

  const status = el('div', { class: 'status', title: 'Connection' });
  const root = el('div', { class: 'dashboard' }, grid, status);

  // One shared second-tick beats a timer per widget on a Pi.
  window.setInterval(() => {
    for (const widget of widgets) widget.tick?.();
  }, 1000);

  applyBurnInShift(root, config);
  applyNightMode(root, config);
  window.setInterval(() => applyNightMode(root, config), 60_000);

  return {
    root,
    update(state) {
      for (const widget of widgets) {
        try {
          widget.update(state);
        } catch (err) {
          // One broken widget must not take the whole screen down.
          console.error(`widget ${widget.root.dataset.widget} failed to update`, err);
        }
      }
      root.dataset.mood = state.brief.mood;
      const stale = state.health.some((h) => !h.ok && h.lastSuccess !== null);
      status.classList.toggle('is-stale', stale);
    },
  };
}

export function setConnected(root: HTMLElement, online: boolean): void {
  root.classList.toggle('is-offline', !online);
}

/**
 * `1fr` is shorthand for `minmax(auto, 1fr)`, so a track written that way
 * refuses to shrink below its content and a busy day pushes widgets straight
 * through the bottom of the screen. Config is hand-written, so rewrite the
 * fractions rather than expecting whoever edits it to know that.
 */
function shrinkable(template: string): string {
  return template.replace(/(^|\s)(\d*\.?\d+)fr(?=\s|$)/g, '$1minmax(0, $2fr)');
}

/** Nudge the layout a pixel or two every few minutes to spare the panel. */
function applyBurnInShift(root: HTMLElement, config: DashboardConfig): void {
  if (!config.display.burnInShift) return;
  const shift = () => {
    const x = Math.round((Math.random() - 0.5) * 8);
    const y = Math.round((Math.random() - 0.5) * 8);
    root.style.transform = `translate(${x}px, ${y}px)`;
  };
  shift();
  window.setInterval(shift, 5 * 60_000);
}

function applyNightMode(root: HTMLElement, config: DashboardConfig): void {
  const night = config.display.nightMode;
  if (!night.enabled) return;

  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const from = toMinutes(night.from);
  const to = toMinutes(night.to);
  // The window normally wraps past midnight, so a straight range test is wrong.
  const active = from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;

  root.classList.toggle('is-night', active);
  root.style.setProperty('--night-dim', active ? String(night.dim) : '1');
}

function toMinutes(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}
