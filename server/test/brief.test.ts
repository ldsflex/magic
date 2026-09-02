import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBrief } from '../src/brief.js';
import type {
  AgendaEvent,
  DashboardConfig,
  Reminder,
  Weather,
} from '../../shared/types.js';

const config = {
  household: { name: 'Home', timezone: 'Australia/Sydney', locale: 'en-AU', people: [] },
  location: { name: 'Byron Bay', latitude: -28.6434, longitude: 153.6122 },
  display: {
    orientation: 'landscape',
    nightMode: { enabled: false, from: '22:00', to: '06:00', dim: 1 },
    burnInShift: false,
    rotateSeconds: 12,
  },
  layout: { columns: '1fr', rows: '1fr', areas: ['hero'] },
  widgets: [],
  sources: {
    weather: { enabled: true, refreshMinutes: 10 },
    surf: { enabled: false, refreshMinutes: 30 },
    calendar: { enabled: true, refreshMinutes: 15, feeds: [] },
    news: { enabled: false, refreshMinutes: 20, feeds: [] },
    bins: {
      enabled: false,
      anchorDate: '2026-09-02',
      anchorBins: [],
      cadenceDays: 7,
      alternating: [],
      remindFromHour: 16,
    },
    compliments: { enabled: false, file: '' },
  },
} as DashboardConfig;

const NOW = new Date('2026-09-02T02:00:00Z'); // midday in Sydney

function weather(overrides: Partial<Weather['now']> = {}, dayOverrides = {}): Weather {
  return {
    now: {
      temperature: 22,
      apparentTemperature: 23,
      code: 0,
      description: 'Clear',
      icon: '☀️',
      isDay: true,
      windSpeed: 12,
      windDirection: 90,
      humidity: 60,
      uvIndex: 4,
      uvBand: 'moderate',
      ...overrides,
    },
    hourly: [],
    daily: [
      {
        date: '2026-09-02',
        min: 15,
        max: 26,
        code: 0,
        icon: '☀️',
        description: 'Clear',
        precipitationProbability: 5,
        precipitationSum: 0,
        uvIndexMax: 5,
        sunrise: '',
        sunset: '',
        ...dayOverrides,
      },
    ],
  };
}

const empty = { config, agenda: [], reminders: [], lists: {}, bins: null, now: NOW };

test('falls back to a weather sentence when nothing needs attention', () => {
  const brief = buildBrief({ ...empty, weather: weather() });
  assert.match(brief.headline, /Clear, 22° now and up to 26° today/);
  assert.equal(brief.mood, 'calm');
});

test('greets when there is no weather at all', () => {
  const brief = buildBrief({ ...empty, weather: null });
  assert.match(brief.headline, /Good (morning|afternoon|evening)/);
});

test('bins outrank everything else', () => {
  const brief = buildBrief({
    ...empty,
    weather: weather(),
    bins: { date: '2026-09-02', bins: ['general', 'recycling'], imminent: true },
  });
  assert.equal(brief.headline, 'Bins out tonight: Red + Yellow');
  assert.equal(brief.mood, 'alert');
});

test('reports a single overdue reminder by name', () => {
  const reminders: Reminder[] = [
    {
      id: 1,
      text: 'Pay the rates',
      dueAt: '2026-09-01T00:00:00Z',
      repeat: 'none',
      assignee: null,
      done: false,
      createdAt: '2026-08-01T00:00:00Z',
    },
  ];
  const brief = buildBrief({ ...empty, weather: weather(), reminders });
  assert.equal(brief.headline, 'Overdue: Pay the rates');
  assert.equal(brief.mood, 'warn');
});

test('counts multiple overdue reminders instead of listing them', () => {
  const make = (id: number, text: string): Reminder => ({
    id,
    text,
    dueAt: '2026-09-01T00:00:00Z',
    repeat: 'none',
    assignee: null,
    done: false,
    createdAt: '2026-08-01T00:00:00Z',
  });
  const brief = buildBrief({
    ...empty,
    weather: weather(),
    reminders: [make(1, 'A'), make(2, 'B')],
  });
  assert.equal(brief.headline, '2 reminders overdue');
});

test('ignores reminders that are already done', () => {
  const reminders: Reminder[] = [
    {
      id: 1,
      text: 'Done thing',
      dueAt: '2026-09-01T00:00:00Z',
      repeat: 'none',
      assignee: null,
      done: true,
      createdAt: '2026-08-01T00:00:00Z',
    },
  ];
  const brief = buildBrief({ ...empty, weather: weather(), reminders });
  assert.ok(!brief.headline.startsWith('Overdue'));
});

test('mentions the next event today with its time', () => {
  const agenda: AgendaEvent[] = [
    {
      id: 'a',
      title: 'Dentist',
      start: '2026-09-02T05:30:00Z',
      end: '2026-09-02T06:00:00Z',
      allDay: false,
      location: null,
      calendar: 'Family',
      colour: '#fff',
      personId: null,
    },
  ];
  const brief = buildBrief({ ...empty, weather: weather(), agenda });
  assert.ok(
    brief.lines.some((l) => l.includes('Dentist') && /3:30/.test(l)),
    `expected a Dentist line, got ${JSON.stringify(brief.lines)}`,
  );
});

test('skips events beyond tomorrow', () => {
  const agenda: AgendaEvent[] = [
    {
      id: 'a',
      title: 'Far away',
      start: '2026-09-20T05:30:00Z',
      end: null,
      allDay: false,
      location: null,
      calendar: 'Family',
      colour: '#fff',
      personId: null,
    },
  ];
  const brief = buildBrief({ ...empty, weather: weather(), agenda });
  assert.ok(!brief.lines.some((l) => l.includes('Far away')));
});

test('warns about imminent rain and turns the mood wet', () => {
  const w = weather();
  w.hourly = [
    {
      time: '2026-09-02T14:00',
      temperature: 20,
      precipitationProbability: 80,
      code: 61,
      icon: '🌦️',
    },
  ];
  const brief = buildBrief({ ...empty, weather: w });
  assert.ok(brief.lines.some((l) => l.startsWith('Rain likely')));
  assert.equal(brief.mood, 'wet');
});

test('escalates to warn for dangerous UV', () => {
  const brief = buildBrief({
    ...empty,
    weather: weather({ uvIndex: 12, uvBand: 'extreme' }, { uvIndexMax: 12 }),
  });
  assert.ok(brief.lines.some((l) => l.includes('UV 12') && l.includes('stay in the shade')));
  assert.equal(brief.mood, 'warn');
});

test('stays quiet about UV after dark', () => {
  const brief = buildBrief({
    ...empty,
    weather: weather({ uvIndex: 12, uvBand: 'extreme', isDay: false }),
  });
  assert.ok(!brief.lines.some((l) => l.includes('UV')));
});

test('mentions the shopping list only once it is worth a trip', () => {
  const item = (id: number) => ({
    id,
    listId: 'shopping',
    text: `thing ${id}`,
    note: null,
    done: false,
    addedBy: null,
    createdAt: '2026-09-01T00:00:00Z',
    completedAt: null,
  });

  const few = buildBrief({ ...empty, weather: weather(), lists: { shopping: [item(1)] } });
  assert.ok(!few.lines.some((l) => l.includes('shopping list')));

  const many = buildBrief({
    ...empty,
    weather: weather(),
    lists: { shopping: [1, 2, 3, 4, 5, 6].map(item) },
  });
  assert.ok(many.lines.some((l) => l === '6 things on the shopping list'));
});

test('caps the detail lines so the panel cannot overflow', () => {
  const w = weather({ uvIndex: 12, uvBand: 'extreme' }, { uvIndexMax: 12 });
  w.hourly = [
    { time: '2026-09-02T14:00', temperature: 20, precipitationProbability: 90, code: 61, icon: '🌦️' },
  ];
  const brief = buildBrief({
    ...empty,
    weather: w,
    bins: { date: '2026-09-02', bins: ['general'], imminent: true },
    reminders: [
      {
        id: 1,
        text: 'Overdue thing',
        dueAt: '2026-09-01T00:00:00Z',
        repeat: 'none',
        assignee: null,
        done: false,
        createdAt: '2026-08-01T00:00:00Z',
      },
    ],
  });
  assert.ok(brief.lines.length <= 4);
  assert.equal(brief.mood, 'alert');
});
