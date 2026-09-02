import type { BinNight, BinsConfig } from '../../../shared/types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Councils publish collection days as a zone and a fortnightly rotation rather
 * than an API, so the schedule is derived from an anchor date you set once.
 */
export function nextBinNight(config: BinsConfig, now = new Date()): BinNight | null {
  if (!config.enabled) return null;

  const anchor = Date.parse(`${config.anchorDate}T00:00:00Z`);
  if (Number.isNaN(anchor)) return null;

  const cadence = Math.max(1, config.cadenceDays);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  // Index of the first collection falling on or after today.
  const elapsed = Math.floor((today - anchor) / DAY_MS);
  const index = Math.max(0, Math.ceil(elapsed / cadence));
  const collection = anchor + index * cadence * DAY_MS;

  const rotation = config.alternating.length > 0 ? config.alternating : [config.anchorBins];
  const bins = rotation[index % rotation.length] ?? config.anchorBins;

  const daysAway = Math.round((collection - today) / DAY_MS);
  // Shout the evening before, and keep shouting on the morning itself.
  const imminent =
    (daysAway === 1 && now.getHours() >= config.remindFromHour) ||
    (daysAway === 0 && now.getHours() < 10);

  return {
    date: new Date(collection).toISOString().slice(0, 10),
    bins,
    imminent,
  };
}

export function binLabel(kind: string): string {
  if (kind === 'general') return 'Red';
  if (kind === 'recycling') return 'Yellow';
  if (kind === 'green') return 'Green';
  return kind;
}
