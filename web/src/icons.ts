/**
 * Weather icons drawn as inline SVG rather than emoji.
 *
 * Emoji were the single most damaging element on the wall: they render
 * differently on every platform, carry their own colour that ignores the
 * palette, and read as clip-art at two metres. These are one stroke weight,
 * one geometry, and inherit `currentColor`, so severity colouring works.
 */

const NS = 'http://www.w3.org/2000/svg';

type Glyph = (svg: SVGSVGElement) => void;

function path(d: string, opts: { fill?: boolean; opacity?: number } = {}): SVGPathElement {
  const el = document.createElementNS(NS, 'path');
  el.setAttribute('d', d);
  if (opts.fill) el.setAttribute('fill', 'currentColor');
  if (opts.opacity !== undefined) el.setAttribute('opacity', String(opts.opacity));
  return el;
}

function circle(cx: number, cy: number, r: number): SVGCircleElement {
  const el = document.createElementNS(NS, 'circle');
  el.setAttribute('cx', String(cx));
  el.setAttribute('cy', String(cy));
  el.setAttribute('r', String(r));
  return el;
}

/**
 * Rays around a sun at (cx, cy), drawn as one path.
 *
 * `skip` drops rays by index (0 = east, advancing clockwise in SVG's
 * y-down space). The partly-cloudy glyphs use it to remove the rays that
 * would otherwise cross the cloud and read as a scribble.
 */
function rays(cx: number, cy: number, inner: number, outer: number, skip: number[] = []): SVGPathElement {
  const segments: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    if (skip.includes(i)) continue;
    const angle = (i * Math.PI) / 4;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    segments.push(
      `M${(cx + cos * inner).toFixed(2)} ${(cy + sin * inner).toFixed(2)}` +
        `L${(cx + cos * outer).toFixed(2)} ${(cy + sin * outer).toFixed(2)}`,
    );
  }
  return path(segments.join(' '));
}

/** One cloud silhouette at two sizes, so every glyph shares a geometry. */
const CLOUD = 'M7.6 18.6h9.3a3.6 3.6 0 0 0 .42-7.16A5.3 5.3 0 0 0 7.2 11.9 3.35 3.35 0 0 0 7.6 18.6Z';
const CLOUD_TUCKED =
  'M11 19.4h6.9a2.95 2.95 0 0 0 .34-5.87A4.35 4.35 0 0 0 10.6 13.9 2.75 2.75 0 0 0 11 19.4Z';

/** Rain, drizzle and snow all hang the same way; only the marks differ. */
function drops(spec: Array<[number, number, number]>): SVGPathElement {
  return path(spec.map(([x, y, len]) => `M${x} ${y}L${x - 1.3} ${y + len}`).join(' '));
}

// The cloud sits low and right, so the sun peeks from the upper left with
// its three cloud-facing rays removed.
const SUN_BEHIND: [number, number] = [7.9, 7.6];
const BEHIND_SKIP = [0, 1, 2];

const GLYPHS: Record<string, Glyph> = {
  sun: (svg) => {
    svg.append(circle(12, 12.4, 4), rays(12, 12.4, 6.7, 9.2));
  },
  moon: (svg) => {
    svg.append(path('M18.8 15.1A7.4 7.4 0 0 1 9.4 5.7a7.4 7.4 0 1 0 9.4 9.4Z'));
  },
  'partly-day': (svg) => {
    svg.append(
      circle(SUN_BEHIND[0], SUN_BEHIND[1], 2.5),
      rays(SUN_BEHIND[0], SUN_BEHIND[1], 4.2, 6, BEHIND_SKIP),
      path(CLOUD_TUCKED),
    );
  },
  'partly-night': (svg) => {
    svg.append(path('M12.6 10.4A4.9 4.9 0 0 1 9.4 3.6a4.9 4.9 0 1 0 3.2 6.8Z'), path(CLOUD_TUCKED));
  },
  cloud: (svg) => {
    svg.append(path(CLOUD));
  },
  drizzle: (svg) => {
    svg.append(path(CLOUD), drops([
      [10.8, 20.4, 1.7],
      [14.4, 20.4, 1.7],
    ]));
  },
  rain: (svg) => {
    svg.append(path(CLOUD), drops([
      [10.8, 20.3, 2.7],
      [14.4, 20.3, 2.7],
    ]));
  },
  'heavy-rain': (svg) => {
    svg.append(path(CLOUD), drops([
      [9.4, 20.3, 2.8],
      [12.6, 20.3, 2.8],
      [15.8, 20.3, 2.8],
    ]));
  },
  snow: (svg) => {
    svg.append(path(CLOUD));
    for (const [x, y] of [
      [10.4, 22],
      [14.4, 22],
    ] as const) {
      svg.append(
        path(`M${x} ${y - 1.5}v3M${x - 1.3} ${y - 0.75}l2.6 1.5M${x + 1.3} ${y - 0.75}l-2.6 1.5`),
      );
    }
  },
  fog: (svg) => {
    svg.append(path(CLOUD), path('M8 21.6h9M10 24.2h5', { opacity: 0.75 }));
  },
  storm: (svg) => {
    svg.append(path(CLOUD), path('M13.2 19.8 10.7 22.6h2.7l-1.4 2.6'));
  },
};

/**
 * WMO 4677 code to glyph. Kept in the browser rather than the server so the
 * wall can restyle without a redeploy of the backend.
 */
function glyphFor(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'sun' : 'moon';
  if (code <= 2) return isDay ? 'partly-day' : 'partly-night';
  if (code === 3) return 'cloud';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 65) return code >= 65 ? 'heavy-rain' : 'rain';
  if (code >= 66 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return code >= 82 ? 'heavy-rain' : 'rain';
  if (code >= 85 && code <= 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}

export function weatherIcon(code: number, isDay = true): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 26');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('wx-glyph');

  (GLYPHS[glyphFor(code, isDay)] ?? GLYPHS.cloud!)(svg);
  return svg;
}

/** A filled droplet, for precipitation-probability labels. */
export function dropIcon(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('drop-glyph');
  svg.append(path('M12 3.5c3.4 4 5.5 6.8 5.5 9.4a5.5 5.5 0 1 1-11 0C6.5 10.3 8.6 7.5 12 3.5Z', { fill: true }));
  return svg;
}
