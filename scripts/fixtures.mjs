#!/usr/bin/env node
/**
 * Offline stand-ins for the upstream feeds, so the dashboard can be developed
 * and screenshotted without network access.
 *
 *   node scripts/fixtures.mjs &
 *   MAGIC_WEATHER_URL=http://127.0.0.1:8999/weather \
 *   MAGIC_MARINE_URL=http://127.0.0.1:8999/marine \
 *   npm start
 *
 * The news and calendar feeds are configured by URL, so point those at
 * http://127.0.0.1:8999/rss and .../calendar.ics in config/dashboard.json.
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.FIXTURE_PORT ?? 8999);

const pad = (n) => String(n).padStart(2, '0');
const localStamp = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
const dayStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function weather() {
  const now = new Date();
  const hours = [];
  const codes = [3, 3, 2, 61, 61, 80, 3, 2, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0, 1, 2, 3, 3, 2, 1];
  const rain = [10, 20, 20, 70, 80, 60, 30, 10, 0, 0, 0, 10, 20, 20, 10, 0, 0, 0, 0, 10, 20, 20, 10, 0];

  for (let i = 0; i < 24; i += 1) {
    const t = new Date(now.getTime() + i * 3_600_000);
    hours.push({ time: localStamp(t), temp: 19 + Math.round(6 * Math.sin(i / 3.6)), code: codes[i], rain: rain[i] });
  }

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now.getTime() + i * 86_400_000);
    days.push({
      date: dayStamp(d),
      code: [3, 61, 80, 0, 1, 2, 95][i],
      max: [26, 22, 21, 27, 28, 25, 23][i],
      min: [16, 15, 14, 17, 18, 17, 16][i],
      rain: [20, 80, 60, 0, 10, 20, 70][i],
      sum: [0, 8.2, 4.1, 0, 0, 0.4, 12.6][i],
      uv: [9.1, 4.2, 5.0, 10.4, 11.2, 8.8, 6.1][i],
    });
  }

  return {
    current: {
      time: localStamp(now),
      temperature_2m: 23.4,
      apparent_temperature: 25.1,
      is_day: now.getHours() >= 6 && now.getHours() < 19 ? 1 : 0,
      weather_code: 3,
      wind_speed_10m: 17.2,
      wind_direction_10m: 112,
      relative_humidity_2m: 71,
      uv_index: 9.1,
    },
    hourly: {
      time: hours.map((h) => h.time),
      temperature_2m: hours.map((h) => h.temp),
      precipitation_probability: hours.map((h) => h.rain),
      weather_code: hours.map((h) => h.code),
    },
    daily: {
      time: days.map((d) => d.date),
      weather_code: days.map((d) => d.code),
      temperature_2m_max: days.map((d) => d.max),
      temperature_2m_min: days.map((d) => d.min),
      precipitation_probability_max: days.map((d) => d.rain),
      precipitation_sum: days.map((d) => d.sum),
      uv_index_max: days.map((d) => d.uv),
      sunrise: days.map((d) => `${d.date}T06:11`),
      sunset: days.map((d) => `${d.date}T17:36`),
    },
  };
}

const marine = {
  current: {
    wave_height: 1.6,
    wave_period: 9.4,
    wave_direction: 118,
    swell_wave_height: 1.4,
    swell_wave_period: 10.2,
    sea_surface_temperature: 22.3,
  },
};

const rss = () => {
  const headlines = [
    'Council approves new shared path along the rail corridor',
    'Whale season numbers up on last year, researchers say',
    'Storm cell expected to cross the coast late Thursday',
    'Local bakery wins state award for its sourdough',
    'Beach access works finish ahead of the long weekend',
  ];
  const items = headlines
    .map(
      (title, i) => `<item>
      <title><![CDATA[${title}]]></title>
      <link>https://example.test/${i}</link>
      <guid>item-${i}</guid>
      <pubDate>${new Date(Date.now() - i * 3_600_000).toUTCString()}</pubDate>
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Local News</title>${items}</channel></rss>`;
};

function calendar() {
  const pad2 = (n) => String(n).padStart(2, '0');
  const stamp = (d) =>
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;

  const now = Date.now();
  const events = [
    ['Swim squad', 2, 1],
    ['Dentist — Mia', 6, 1],
    ['Dinner at the Italian place', 9, 2],
    ['Rubbish out', 30, 1],
    ['Nina birthday party', 34, 3],
    ['Car service', 52, 2],
  ];

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//magic//fixtures//EN'];
  events.forEach(([title, offsetHours, durationHours], i) => {
    const start = new Date(now + offsetHours * 3_600_000);
    const end = new Date(start.getTime() + durationHours * 3_600_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:fixture-${i}`,
      `SUMMARY:${title}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0];
  const send = (type, body) => {
    res.writeHead(200, { 'content-type': type, 'access-control-allow-origin': '*' });
    res.end(body);
  };

  if (path === '/weather') send('application/json', JSON.stringify(weather()));
  else if (path === '/marine') send('application/json', JSON.stringify(marine));
  else if (path === '/rss') send('text/xml', rss());
  else if (path === '/calendar.ics') send('text/calendar', calendar());
  else {
    res.writeHead(404);
    res.end('no fixture at ' + path);
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`fixtures on http://127.0.0.1:${PORT} — /weather /marine /rss /calendar.ics`);
});
