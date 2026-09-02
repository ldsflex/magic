import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expand, parseIcs, wallToUtc } from '../src/sources/ics.js';

const TZ = 'Australia/Sydney';

function ics(...lines: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');
}

function vevent(...lines: string[]): string {
  return ics('BEGIN:VEVENT', ...lines, 'END:VEVENT');
}

/** Window covering a whole year from the given local date. */
function yearFrom(y: number, mo: number, d: number): [number, number] {
  const start = wallToUtc(y, mo, d, 0, 0, 0, TZ);
  return [start, start + 370 * 86_400_000];
}

test('parses a timed event with an explicit timezone', () => {
  const events = parseIcs(
    vevent(
      'UID:one',
      'SUMMARY:School pickup',
      'LOCATION:Byron Public',
      'DTSTART;TZID=Australia/Sydney:20260910T150000',
      'DTEND;TZID=Australia/Sydney:20260910T153000',
    ),
    TZ,
  );

  assert.equal(events.length, 1);
  const event = events[0]!;
  assert.equal(event.summary, 'School pickup');
  assert.equal(event.location, 'Byron Public');
  assert.equal(event.allDay, false);
  assert.equal(event.start, wallToUtc(2026, 9, 10, 15, 0, 0, TZ));
  assert.equal(event.end! - event.start, 30 * 60 * 1000);
});

test('parses UTC stamps and floating times differently', () => {
  const [utc] = parseIcs(vevent('UID:z', 'SUMMARY:Z', 'DTSTART:20260910T050000Z'), TZ);
  assert.equal(utc!.start, Date.UTC(2026, 8, 10, 5, 0, 0));

  const [floating] = parseIcs(vevent('UID:f', 'SUMMARY:F', 'DTSTART:20260910T050000'), TZ);
  assert.equal(floating!.start, wallToUtc(2026, 9, 10, 5, 0, 0, TZ));
});

test('all-day events anchor to local midnight', () => {
  const [event] = parseIcs(
    vevent('UID:allday', 'SUMMARY:Public holiday', 'DTSTART;VALUE=DATE:20261225'),
    TZ,
  );
  assert.equal(event!.allDay, true);
  assert.equal(event!.start, wallToUtc(2026, 12, 25, 0, 0, 0, TZ));
});

test('unfolds folded lines', () => {
  const [event] = parseIcs(
    vevent(
      'UID:fold',
      'SUMMARY:A very long title that the exporter',
      '  wrapped across two lines',
      'DTSTART:20260910T050000Z',
    ),
    TZ,
  );
  assert.equal(event!.summary, 'A very long title that the exporter wrapped across two lines');
});

test('unescapes commas and semicolons in text', () => {
  const [event] = parseIcs(
    vevent('UID:esc', 'SUMMARY:Dinner\\, then drinks\\; late', 'DTSTART:20260910T050000Z'),
    TZ,
  );
  assert.equal(event!.summary, 'Dinner, then drinks; late');
});

test('expands a weekly BYDAY rule onto the right weekdays', () => {
  const [start, end] = yearFrom(2026, 9, 1);
  const events = parseIcs(
    vevent(
      'UID:bins',
      'SUMMARY:Yoga',
      'DTSTART;TZID=Australia/Sydney:20260901T060000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6',
    ),
    TZ,
  );

  const occurrences = expand(events, start, end, TZ);
  assert.equal(occurrences.length, 6);

  // 1 Sep 2026 is a Tuesday, so Tue/Thu pairs for three weeks.
  const days = occurrences.map((o) =>
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date(o.start)),
  );
  assert.deepEqual(days, ['Tue', 'Thu', 'Tue', 'Thu', 'Tue', 'Thu']);

  // Every occurrence keeps the 6am wall-clock start.
  for (const o of occurrences) {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      hour12: false,
    }).format(new Date(o.start));
    assert.equal(hour, '06');
  }
});

test('holds wall-clock time across a daylight saving transition', () => {
  // NSW moves to daylight saving on 4 October 2026.
  const [start, end] = yearFrom(2026, 9, 28);
  const events = parseIcs(
    vevent(
      'UID:dst',
      'SUMMARY:Standup',
      'DTSTART;TZID=Australia/Sydney:20260928T090000',
      'RRULE:FREQ=DAILY;COUNT=14',
    ),
    TZ,
  );

  const hours = expand(events, start, end, TZ).map((o) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(
      new Date(o.start),
    ),
  );
  assert.deepEqual(new Set(hours), new Set(['09']));
  assert.equal(hours.length, 14);
});

test('honours UNTIL', () => {
  const [start, end] = yearFrom(2026, 9, 1);
  const events = parseIcs(
    vevent(
      'UID:until',
      'SUMMARY:Ends soon',
      'DTSTART:20260901T000000Z',
      'RRULE:FREQ=DAILY;UNTIL=20260905T000000Z',
    ),
    TZ,
  );
  assert.equal(expand(events, start, end, TZ).length, 5);
});

test('drops EXDATE occurrences', () => {
  const [start, end] = yearFrom(2026, 9, 1);
  const events = parseIcs(
    vevent(
      'UID:ex',
      'SUMMARY:Weekly',
      'DTSTART:20260901T000000Z',
      'RRULE:FREQ=DAILY;COUNT=4',
      'EXDATE:20260902T000000Z',
    ),
    TZ,
  );
  const occurrences = expand(events, start, end, TZ);
  assert.equal(occurrences.length, 3);
  assert.ok(!occurrences.some((o) => o.start === Date.UTC(2026, 8, 2)));
});

test('applies a RECURRENCE-ID override to a single occurrence', () => {
  const [start, end] = yearFrom(2026, 9, 1);
  const events = parseIcs(
    ics(
      'BEGIN:VEVENT',
      'UID:series',
      'SUMMARY:Team lunch',
      'DTSTART:20260901T000000Z',
      'RRULE:FREQ=DAILY;COUNT=3',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:series',
      'RECURRENCE-ID:20260902T000000Z',
      'SUMMARY:Team lunch (moved)',
      'DTSTART:20260902T030000Z',
      'END:VEVENT',
    ),
    TZ,
  );

  const occurrences = expand(events, start, end, TZ);
  assert.equal(occurrences.length, 3);
  const moved = occurrences.find((o) => o.summary.includes('moved'));
  assert.ok(moved, 'override should replace the second occurrence');
  assert.equal(moved!.start, Date.UTC(2026, 8, 2, 3));
});

test('expands monthly nth-weekday rules', () => {
  const [start, end] = yearFrom(2026, 9, 1);
  const events = parseIcs(
    vevent(
      'UID:monthly',
      'SUMMARY:Book club',
      'DTSTART;TZID=Australia/Sydney:20260908T190000',
      'RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3',
    ),
    TZ,
  );

  const occurrences = expand(events, start, end, TZ);
  assert.equal(occurrences.length, 3);
  const dates = occurrences.map((o) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(o.start)),
  );
  // Second Tuesday of Sep, Oct and Nov 2026.
  assert.deepEqual(dates, ['2026-09-08', '2026-10-13', '2026-11-10']);
});

test('uses DURATION when DTEND is absent', () => {
  const [event] = parseIcs(
    vevent('UID:dur', 'SUMMARY:Call', 'DTSTART:20260901T000000Z', 'DURATION:PT1H30M'),
    TZ,
  );
  assert.equal(event!.end! - event!.start, 90 * 60 * 1000);
});

test('keeps an event that is already running', () => {
  const now = Date.UTC(2026, 8, 1, 12);
  const events = parseIcs(
    vevent('UID:live', 'SUMMARY:Long thing', 'DTSTART:20260901T090000Z', 'DTEND:20260901T170000Z'),
    TZ,
  );
  const occurrences = expand(events, now, now + 86_400_000, TZ);
  assert.equal(occurrences.length, 1);
});

test('falls back to the household timezone for an unknown TZID', () => {
  const [event] = parseIcs(
    vevent('UID:bad', 'SUMMARY:X', 'DTSTART;TZID=Mars/Olympus:20260901T090000'),
    TZ,
  );
  assert.equal(event!.start, wallToUtc(2026, 9, 1, 9, 0, 0, TZ));
});

test('an unparseable RRULE still yields the first occurrence', () => {
  const [start, end] = yearFrom(2026, 9, 1);
  const events = parseIcs(
    vevent('UID:weird', 'SUMMARY:Odd', 'DTSTART:20260901T000000Z', 'RRULE:FREQ=FORTNIGHTLY'),
    TZ,
  );
  assert.equal(expand(events, start, end, TZ).length, 1);
});

test('ignores events with no start date', () => {
  assert.equal(parseIcs(vevent('UID:nostart', 'SUMMARY:Broken'), TZ).length, 0);
});
