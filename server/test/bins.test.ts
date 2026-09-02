import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextBinNight } from '../src/sources/bins.js';
import type { BinsConfig } from '../../shared/types.js';

const base: BinsConfig = {
  enabled: true,
  anchorDate: '2026-09-02',
  anchorBins: ['general', 'recycling'],
  cadenceDays: 7,
  alternating: [
    ['general', 'recycling'],
    ['general', 'green'],
  ],
  remindFromHour: 16,
};

/** Local-time date, since the reminder window depends on the wall clock. */
const at = (y: number, mo: number, d: number, h: number) => new Date(y, mo - 1, d, h, 0, 0);

test('returns null when disabled', () => {
  assert.equal(nextBinNight({ ...base, enabled: false }), null);
});

test('finds the collection on the anchor date itself', () => {
  const night = nextBinNight(base, at(2026, 9, 2, 7));
  assert.equal(night?.date, '2026-09-02');
  assert.deepEqual(night?.bins, ['general', 'recycling']);
});

test('rolls to the following week once the day has passed', () => {
  const night = nextBinNight(base, at(2026, 9, 3, 12));
  assert.equal(night?.date, '2026-09-09');
});

test('alternates the bin set week to week', () => {
  assert.deepEqual(nextBinNight(base, at(2026, 9, 9, 12))?.bins, ['general', 'green']);
  assert.deepEqual(nextBinNight(base, at(2026, 9, 16, 12))?.bins, ['general', 'recycling']);
  assert.deepEqual(nextBinNight(base, at(2026, 9, 23, 12))?.bins, ['general', 'green']);
});

test('goes imminent the evening before, not the morning before', () => {
  assert.equal(nextBinNight(base, at(2026, 9, 8, 9))?.imminent, false);
  assert.equal(nextBinNight(base, at(2026, 9, 8, 17))?.imminent, true);
});

test('stays imminent on the morning of collection, then stands down', () => {
  assert.equal(nextBinNight(base, at(2026, 9, 9, 6))?.imminent, true);
  assert.equal(nextBinNight(base, at(2026, 9, 9, 11))?.imminent, false);
});

test('handles a fortnightly cadence', () => {
  const fortnightly: BinsConfig = { ...base, cadenceDays: 14, alternating: [] };
  assert.equal(nextBinNight(fortnightly, at(2026, 9, 3, 12))?.date, '2026-09-16');
  assert.deepEqual(nextBinNight(fortnightly, at(2026, 9, 3, 12))?.bins, ['general', 'recycling']);
});

test('works for dates before the anchor', () => {
  assert.equal(nextBinNight(base, at(2026, 8, 20, 12))?.date, '2026-09-02');
});

test('rejects an unparseable anchor date', () => {
  assert.equal(nextBinNight({ ...base, anchorDate: 'not-a-date' }), null);
});
