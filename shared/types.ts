/**
 * Types shared between the server and the browser.
 *
 * The browser only ever imports these as types, so nothing here is emitted
 * into the client bundle and no build wiring is needed to resolve it.
 */

export interface Person {
  id: string;
  name: string;
  colour: string;
}

export interface HouseholdConfig {
  name: string;
  timezone: string;
  locale: string;
  people: Person[];
}

export interface LocationConfig {
  name: string;
  latitude: number;
  longitude: number;
}

export interface NightModeConfig {
  enabled: boolean;
  /** "HH:MM" local time the screen starts dimming. */
  from: string;
  /** "HH:MM" local time the screen returns to full brightness. */
  to: string;
  /** Opacity multiplier applied during night mode, 0–1. */
  dim: number;
}

export interface DisplayConfig {
  orientation: 'landscape' | 'portrait';
  nightMode: NightModeConfig;
  /** Nudge the whole layout by a pixel or two now and then to spare the panel. */
  burnInShift: boolean;
  /** How long each item stays up in widgets that rotate through a list. */
  rotateSeconds: number;
}

export interface LayoutConfig {
  columns: string;
  rows: string;
  /** One string per grid row, area names separated by whitespace. */
  areas: string[];
}

export type WidgetType =
  | 'clock'
  | 'brief'
  | 'weather'
  | 'surf'
  | 'agenda'
  | 'list'
  | 'reminders'
  | 'news';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  area: string;
  options?: Record<string, unknown>;
}

export interface CalendarFeed {
  name: string;
  url: string;
  colour?: string;
  personId?: string;
}

export interface NewsFeed {
  name: string;
  url: string;
}

export type BinKind = 'general' | 'recycling' | 'green';

export interface BinsConfig {
  enabled: boolean;
  /** A date you know collection happened, as "YYYY-MM-DD". */
  anchorDate: string;
  anchorBins: BinKind[];
  cadenceDays: number;
  /** Rotation of bin sets, starting at anchorDate. Empty means every week is the same. */
  alternating: BinKind[][];
  /** Local hour after which the evening-before nudge appears. */
  remindFromHour: number;
}

export interface SourcesConfig {
  weather: { enabled: boolean; refreshMinutes: number };
  surf: { enabled: boolean; refreshMinutes: number };
  calendar: { enabled: boolean; refreshMinutes: number; feeds: CalendarFeed[] };
  news: { enabled: boolean; refreshMinutes: number; feeds: NewsFeed[] };
  bins: BinsConfig;
  compliments: { enabled: boolean; file: string };
}

export interface DashboardConfig {
  household: HouseholdConfig;
  location: LocationConfig;
  display: DisplayConfig;
  layout: LayoutConfig;
  widgets: WidgetConfig[];
  sources: SourcesConfig;
}

/* ------------------------------------------------------------------ */
/* Live state                                                          */
/* ------------------------------------------------------------------ */

export interface WeatherNow {
  temperature: number;
  apparentTemperature: number;
  code: number;
  description: string;
  icon: string;
  isDay: boolean;
  windSpeed: number;
  windDirection: number;
  humidity: number;
  uvIndex: number;
  /** Bands used for the "cover up" nudge: low/moderate/high/very-high/extreme. */
  uvBand: string;
}

export interface WeatherHour {
  time: string;
  temperature: number;
  precipitationProbability: number;
  code: number;
  icon: string;
}

export interface WeatherDay {
  date: string;
  min: number;
  max: number;
  code: number;
  icon: string;
  description: string;
  precipitationProbability: number;
  precipitationSum: number;
  uvIndexMax: number;
  sunrise: string;
  sunset: string;
}

export interface Weather {
  now: WeatherNow;
  hourly: WeatherHour[];
  daily: WeatherDay[];
}

export interface Surf {
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDirection: number | null;
  swellHeight: number | null;
  swellPeriod: number | null;
  seaTemperature: number | null;
}

export interface AgendaEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  calendar: string;
  colour: string;
  personId: string | null;
}

export interface ListItem {
  id: number;
  listId: string;
  text: string;
  note: string | null;
  done: boolean;
  addedBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type ReminderRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Reminder {
  id: number;
  text: string;
  dueAt: string | null;
  repeat: ReminderRepeat;
  assignee: string | null;
  done: boolean;
  createdAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  link: string;
  publishedAt: string | null;
}

export interface BinNight {
  date: string;
  bins: BinKind[];
  /** True once we are close enough that the screen should shout about it. */
  imminent: boolean;
}

/** Severity drives the ambient tint behind the whole dashboard. */
export type Mood = 'calm' | 'wet' | 'warn' | 'alert';

export interface Brief {
  /** One sentence, the thing you read if you read nothing else. */
  headline: string;
  /** Short supporting lines, already ordered by importance. */
  lines: string[];
  mood: Mood;
}

export interface SourceHealth {
  name: string;
  ok: boolean;
  lastSuccess: string | null;
  lastError: string | null;
}

export interface DashboardState {
  generatedAt: string;
  compliment: string | null;
  weather: Weather | null;
  surf: Surf | null;
  agenda: AgendaEvent[];
  lists: Record<string, ListItem[]>;
  reminders: Reminder[];
  news: NewsItem[];
  bins: BinNight | null;
  brief: Brief;
  health: SourceHealth[];
}

export interface BootstrapPayload {
  config: DashboardConfig;
  state: DashboardState;
}
