import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

/**
 * Exercises the fetching adapters against a local fixture server, so the
 * response-shape assumptions are covered without reaching the public internet.
 */

const OPEN_METEO = {
  current: {
    time: '2026-09-02T12:00',
    temperature_2m: 21.6,
    apparent_temperature: 22.4,
    is_day: 1,
    weather_code: 3,
    wind_speed_10m: 14.2,
    wind_direction_10m: 135,
    relative_humidity_2m: 68,
    uv_index: 8.4,
  },
  hourly: {
    time: ['2026-09-02T00:00', '2026-09-02T12:00', '2026-09-02T13:00', '2026-09-02T14:00'],
    temperature_2m: [15.1, 21.6, 22.2, 21.8],
    precipitation_probability: [0, 10, null, 70],
    weather_code: [0, 3, 3, 61],
  },
  daily: {
    time: ['2026-09-02', '2026-09-03'],
    weather_code: [3, 61],
    temperature_2m_max: [24.4, 21.1],
    temperature_2m_min: [14.6, 15.2],
    precipitation_probability_max: [20, 80],
    precipitation_sum: [0, 6.35],
    uv_index_max: [8.4, 4.2],
    sunrise: ['2026-09-02T06:11', '2026-09-03T06:10'],
    sunset: ['2026-09-02T17:36', '2026-09-03T17:37'],
  },
};

const MARINE = {
  current: {
    wave_height: 1.44,
    wave_period: 8.2,
    wave_direction: 112,
    swell_wave_height: 1.2,
    swell_wave_period: 9.1,
    sea_surface_temperature: 21.44,
  },
};

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test Feed</title>
  <item>
    <title><![CDATA[Council extends beach access works]]></title>
    <link>https://example.test/a</link>
    <guid>a</guid>
    <pubDate>Wed, 02 Sep 2026 01:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Storms &amp; swell forecast for the weekend</title>
    <link>https://example.test/b</link>
    <guid>b</guid>
    <pubDate>Wed, 02 Sep 2026 03:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>An atom headline</title>
    <link href="https://example.test/atom-1"/>
    <id>atom-1</id>
    <updated>2026-09-02T02:00:00Z</updated>
  </entry>
</feed>`;

/** Anchored to tomorrow so the agenda window always contains it. */
function calendarFixture(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const stamp = (hour: number) =>
    [
      tomorrow.getUTCFullYear(),
      String(tomorrow.getUTCMonth() + 1).padStart(2, '0'),
      String(tomorrow.getUTCDate()).padStart(2, '0'),
      'T',
      String(hour).padStart(2, '0'),
      '0000',
    ].join('');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:cal-1',
    'SUMMARY:Swimming lesson',
    `DTSTART:${stamp(4)}Z`,
    `DTEND:${stamp(5)}Z`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

let server: Server;
let base = '';

before(async () => {
  server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    const send = (type: string, body: string) => {
      res.writeHead(200, { 'content-type': type });
      res.end(body);
    };

    if (path === '/weather') send('application/json', JSON.stringify(OPEN_METEO));
    else if (path === '/marine') send('application/json', JSON.stringify(MARINE));
    else if (path === '/rss') send('text/xml', RSS);
    else if (path === '/atom') send('text/xml', ATOM);
    else if (path === '/calendar.ics') send('text/calendar', calendarFixture());
    else if (path === '/empty-weather') send('application/json', '{}');
    else {
      res.writeHead(500);
      res.end('boom');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

test('maps an Open-Meteo response onto the weather model', async () => {
  process.env.MAGIC_WEATHER_URL = `${base}/weather`;
  const { fetchWeather } = await import(`../src/sources/weather.js?weather-ok`);

  const weather = await fetchWeather(
    { name: 'Byron Bay', latitude: -28.6434, longitude: 153.6122 },
    'Australia/Sydney',
  );

  assert.equal(weather.now.temperature, 22);
  assert.equal(weather.now.description, 'Overcast');
  assert.equal(weather.now.isDay, true);
  assert.equal(weather.now.uvIndex, 8.4);
  assert.equal(weather.now.uvBand, 'very high');

  assert.equal(weather.daily.length, 2);
  assert.equal(weather.daily[0]!.max, 24);
  assert.equal(weather.daily[1]!.precipitationSum, 6.4);
  assert.equal(weather.daily[1]!.description, 'Light rain');

  // A null precipitation probability must not surface as "null%".
  const nulled = weather.hourly.find((h) => h.time === '2026-09-02T13:00');
  if (nulled) assert.equal(nulled.precipitationProbability, 0);
});

test('rejects a weather response with no current block', async () => {
  process.env.MAGIC_WEATHER_URL = `${base}/empty-weather`;
  const { fetchWeather } = await import(`../src/sources/weather.js?weather-empty`);
  await assert.rejects(
    () => fetchWeather({ name: 'x', latitude: 0, longitude: 0 }, 'UTC'),
    /no current conditions/,
  );
});

test('maps the marine response and rounds sensibly', async () => {
  process.env.MAGIC_MARINE_URL = `${base}/marine`;
  const { fetchSurf } = await import(`../src/sources/surf.js?marine-ok`);

  const surf = await fetchSurf({ name: 'x', latitude: -28.6, longitude: 153.6 }, 'Australia/Sydney');
  assert.equal(surf.waveHeight, 1.4);
  assert.equal(surf.seaTemperature, 21.4);
  assert.equal(surf.waveDirection, 112);
});

test('parses RSS and Atom, newest first', async () => {
  const { fetchNews } = await import('../src/sources/news.js');
  const { items, errors } = await fetchNews([
    { name: 'RSS', url: `${base}/rss` },
    { name: 'Atom', url: `${base}/atom` },
  ]);

  assert.deepEqual(errors, []);
  assert.equal(items.length, 3);
  assert.equal(items[0]!.title, 'Storms & swell forecast for the weekend');
  assert.equal(items[0]!.source, 'RSS');

  const atom = items.find((i) => i.source === 'Atom');
  assert.equal(atom!.link, 'https://example.test/atom-1');

  // CDATA must be unwrapped rather than shown literally.
  assert.ok(items.some((i) => i.title === 'Council extends beach access works'));
});

test('one bad news feed does not lose the others', async () => {
  const { fetchNews } = await import('../src/sources/news.js');
  const { items, errors } = await fetchNews([
    { name: 'Good', url: `${base}/rss` },
    { name: 'Bad', url: `${base}/nope` },
  ]);

  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /^Bad: /);
  assert.equal(items.length, 2);
});

test('fetches and expands a calendar feed', async () => {
  const { fetchAgenda } = await import('../src/sources/calendar.js');
  const { events, errors } = await fetchAgenda(
    [{ name: 'Family', url: `${base}/calendar.ics`, colour: '#7dd3fc', personId: 'tito' }],
    'Australia/Sydney',
  );

  assert.deepEqual(errors, []);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.title, 'Swimming lesson');
  assert.equal(events[0]!.calendar, 'Family');
  assert.equal(events[0]!.colour, '#7dd3fc');
  assert.equal(events[0]!.personId, 'tito');
});

test('reports a calendar feed that cannot be reached', async () => {
  const { fetchAgenda } = await import('../src/sources/calendar.js');
  const { events, errors } = await fetchAgenda([{ name: 'Broken', url: `${base}/nope` }], 'UTC');
  assert.equal(events.length, 0);
  assert.equal(errors.length, 1);
});
