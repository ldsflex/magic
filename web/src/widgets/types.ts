import type { DashboardConfig, DashboardState, WidgetConfig } from '../../../shared/types.js';

export interface WidgetContext {
  config: DashboardConfig;
  widget: WidgetConfig;
  /** Widget options from config, already narrowed by the helpers below. */
  option: {
    number: (key: string, fallback: number) => number;
    string: (key: string, fallback: string) => string;
  };
}

/**
 * Every widget is a factory: it builds its root element once, then patches it
 * on each state push. Nothing is torn down and rebuilt, so the screen never
 * flickers and CSS transitions survive updates.
 */
export interface Widget {
  root: HTMLElement;
  update(state: DashboardState): void;
  /** Optional per-second tick, for widgets that show live time. */
  tick?(): void;
  destroy?(): void;
}

export type WidgetFactory = (ctx: WidgetContext) => Widget;

export function makeContext(config: DashboardConfig, widget: WidgetConfig): WidgetContext {
  const options = widget.options ?? {};
  return {
    config,
    widget,
    option: {
      number: (key, fallback) => {
        const raw = options[key];
        return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
      },
      string: (key, fallback) => {
        const raw = options[key];
        return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
      },
    },
  };
}
