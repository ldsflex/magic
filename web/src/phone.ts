import { api } from './api.js';
import { el, replace } from './dom.js';
import { relativeDay, relativeFromNow, time } from './format.js';
import type { DashboardConfig, DashboardState, ListItem } from '../../shared/types.js';

const WHO_KEY = 'magic.who';

export interface PhoneView {
  root: HTMLElement;
  update(state: DashboardState): void;
}

/**
 * The companion view. It exists because a shopping list nobody can add to from
 * the aisle is a decoration, not a tool.
 */
export function createPhone(config: DashboardConfig): PhoneView {
  let who = localStorage.getItem(WHO_KEY) ?? '';
  let tab: 'shopping' | 'reminders' | 'agenda' = 'shopping';
  let latest: DashboardState | null = null;

  const body = el('div', { class: 'phone-body' });

  const tabs = el(
    'nav',
    { class: 'phone-tabs' },
    ...(['shopping', 'reminders', 'agenda'] as const).map((name) =>
      el('button', {
        type: 'button',
        text: name === 'shopping' ? 'Shopping' : name === 'reminders' ? 'Reminders' : 'Agenda',
        class: name === tab ? 'is-active' : '',
        dataset: { tab: name },
        on: {
          click: () => {
            tab = name;
            for (const button of tabs.querySelectorAll('button')) {
              button.classList.toggle('is-active', button.dataset.tab === tab);
            }
            render();
          },
        },
      }),
    ),
  );

  const whoInput = el('input', {
    class: 'phone-who',
    type: 'text',
    placeholder: 'your name',
    value: who,
    maxlength: '24',
    on: {
      change: (event) => {
        who = (event.target as HTMLInputElement).value.trim();
        localStorage.setItem(WHO_KEY, who);
      },
    },
  });

  const root = el(
    'div',
    { class: 'phone' },
    el(
      'header',
      { class: 'phone-header' },
      el('h1', { text: config.household.name }),
      whoInput,
    ),
    tabs,
    body,
  );

  const render = () => {
    if (!latest) return;
    if (tab === 'shopping') renderShopping(body, latest.lists.shopping ?? [], () => who);
    else if (tab === 'reminders') renderReminders(body, latest);
    else renderAgenda(body, latest);
  };

  return {
    root,
    update(state) {
      latest = state;
      render();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Shopping                                                            */
/* ------------------------------------------------------------------ */

function renderShopping(body: HTMLElement, items: ListItem[], who: () => string): void {
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  const input = el('input', {
    class: 'add-input',
    type: 'text',
    placeholder: 'Add an item…',
    enterkeyhint: 'done',
    autocapitalize: 'sentences',
  });

  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    // Fire and forget: the SSE push repaints the list authoritatively.
    try {
      await api.addItem('shopping', text, who() || undefined);
    } catch (err) {
      console.error(err);
      input.value = text;
    }
    input.focus();
  };

  const form = el(
    'form',
    {
      class: 'add-row',
      on: {
        submit: (event) => {
          event.preventDefault();
          void submit();
        },
      },
    },
    input,
    el('button', { type: 'submit', class: 'add-button', text: 'Add' }),
  );

  replace(
    body,
    form,
    el(
      'ul',
      { class: 'phone-list' },
      ...open.map((item) => shoppingRow(item, false)),
      ...done.map((item) => shoppingRow(item, true)),
    ),
    done.length > 0
      ? el('button', {
          class: 'clear-button',
          type: 'button',
          text: `Clear ${done.length} done`,
          on: { click: () => void api.clearDone('shopping').catch(console.error) },
        })
      : null,
  );
}

function shoppingRow(item: ListItem, done: boolean): HTMLElement {
  return el(
    'li',
    { class: `phone-row${done ? ' is-done' : ''}` },
    el('button', {
      class: 'row-check',
      type: 'button',
      'aria-label': done ? 'Mark not bought' : 'Mark bought',
      text: done ? '☑' : '☐',
      on: { click: () => void api.setItemDone(item.id, !done).catch(console.error) },
    }),
    el(
      'span',
      { class: 'row-body' },
      el('span', { class: 'row-text', text: item.text }),
      item.addedBy ? el('span', { class: 'row-meta', text: item.addedBy }) : null,
    ),
    el('button', {
      class: 'row-delete',
      type: 'button',
      'aria-label': 'Delete',
      text: '✕',
      on: { click: () => void api.deleteItem(item.id).catch(console.error) },
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

function renderReminders(body: HTMLElement, state: DashboardState): void {
  const text = el('input', { class: 'add-input', type: 'text', placeholder: 'Remind us to…' });
  const due = el('input', { class: 'add-due', type: 'datetime-local' });
  const repeat = el(
    'select',
    { class: 'add-repeat' },
    ...(['none', 'daily', 'weekly', 'monthly'] as const).map((value) =>
      el('option', { value, text: value === 'none' ? 'once' : value }),
    ),
  );

  const form = el(
    'form',
    {
      class: 'add-row is-stacked',
      on: {
        submit: (event) => {
          event.preventDefault();
          const value = text.value.trim();
          if (!value) return;
          text.value = '';
          const dueAt = due.value ? new Date(due.value).toISOString() : null;
          void api.addReminder(value, dueAt, repeat.value).catch(console.error);
        },
      },
    },
    text,
    el('div', { class: 'add-row' }, due, repeat, el('button', { type: 'submit', class: 'add-button', text: 'Add' })),
  );

  const now = Date.now();
  const open = state.reminders.filter((r) => !r.done);

  replace(
    body,
    form,
    state.bins?.imminent
      ? el('p', { class: 'phone-banner', text: `Bins out tonight: ${state.bins.bins.join(', ')}` })
      : null,
    el(
      'ul',
      { class: 'phone-list' },
      ...open.map((reminder) => {
        const overdue = reminder.dueAt !== null && Date.parse(reminder.dueAt) <= now;
        return el(
          'li',
          { class: `phone-row${overdue ? ' is-overdue' : ''}` },
          el('button', {
            class: 'row-check',
            type: 'button',
            text: '☐',
            'aria-label': 'Mark done',
            on: { click: () => void api.completeReminder(reminder.id, true).catch(console.error) },
          }),
          el(
            'span',
            { class: 'row-body' },
            el('span', { class: 'row-text', text: reminder.text }),
            el('span', {
              class: 'row-meta',
              text: [
                reminder.dueAt ? relativeFromNow(reminder.dueAt, now) : null,
                reminder.repeat !== 'none' ? reminder.repeat : null,
                reminder.assignee,
              ]
                .filter(Boolean)
                .join(' · '),
            }),
          ),
          el('button', {
            class: 'row-delete',
            type: 'button',
            text: '✕',
            'aria-label': 'Delete',
            on: { click: () => void api.deleteReminder(reminder.id).catch(console.error) },
          }),
        );
      }),
    ),
    open.length === 0 ? el('p', { class: 'widget-empty', text: 'Nothing to do.' }) : null,
  );
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */

function renderAgenda(body: HTMLElement, state: DashboardState): void {
  const now = new Date();
  const upcoming = state.agenda.filter((e) => Date.parse(e.end ?? e.start) >= now.getTime());

  replace(
    body,
    el(
      'ul',
      { class: 'phone-list' },
      ...upcoming.slice(0, 40).map((event) =>
        el(
          'li',
          { class: 'phone-row is-static' },
          el('span', { class: 'row-dot', style: { background: event.colour } }),
          el(
            'span',
            { class: 'row-body' },
            el('span', { class: 'row-text', text: event.title }),
            el('span', {
              class: 'row-meta',
              text: `${relativeDay(event.start, now)}${event.allDay ? '' : ` · ${time(event.start)}`}`,
            }),
          ),
        ),
      ),
    ),
    upcoming.length === 0 ? el('p', { class: 'widget-empty', text: 'Nothing scheduled.' }) : null,
  );
}
