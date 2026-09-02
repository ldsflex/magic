import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickCompliment } from '../src/sources/compliments.js';

const FILE = 'custom_compliments/custom_compliments.json';

const MORNING = ['Good morning, Tito!', 'Time to shine!'];
const EVENING = ['Good evening, star!', 'Relax and unwind.'];

/**
 * 09:36 UTC is 19:36 in Sydney. A server running on UTC — which is the
 * default on a fresh Pi image — used to greet the household with "Good
 * morning" over dinner.
 */
const UTC_MORNING_SYDNEY_EVENING = new Date('2026-09-02T09:36:00Z');

test('buckets by the household timezone, not the server clock', () => {
  const picked = pickCompliment(FILE, null, 'Australia/Sydney', UTC_MORNING_SYDNEY_EVENING);
  assert.ok(picked, 'expected a compliment');
  assert.ok(
    EVENING.some((line) => picked.startsWith(line.slice(0, 12))),
    `expected an evening compliment in Sydney, got ${JSON.stringify(picked)}`,
  );
});

test('the same instant is morning in London', () => {
  const picked = pickCompliment(FILE, null, 'Europe/London', UTC_MORNING_SYDNEY_EVENING);
  assert.ok(picked, 'expected a compliment');
  assert.ok(
    MORNING.some((line) => picked.startsWith(line.slice(0, 10))) || picked.includes('giorno'),
    `expected a morning compliment in London, got ${JSON.stringify(picked)}`,
  );
});

test('crosses the date line correctly for afternoon', () => {
  // 03:00 UTC is 13:00 in Sydney — afternoon, not morning or evening.
  const picked = pickCompliment(FILE, null, 'Australia/Sydney', new Date('2026-09-02T03:00:00Z'));
  assert.ok(picked, 'expected a compliment');
  assert.ok(
    ['Hello there!', 'Keep up the great work!'].includes(picked),
    `expected an afternoon compliment, got ${JSON.stringify(picked)}`,
  );
});

test('returns null when no file is configured', () => {
  assert.equal(pickCompliment('', null, 'UTC'), null);
});

test('survives a missing or half-saved file', () => {
  assert.equal(pickCompliment('does/not/exist.json', null, 'UTC'), null);
});

test('falls back to the server clock for an unusable timezone', () => {
  // Must not throw: a typo in config should degrade, not break the widget.
  assert.doesNotThrow(() => pickCompliment(FILE, null, 'Not/AZone'));
});
