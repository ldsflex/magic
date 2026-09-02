import { fetchText } from '../http.js';
import type { NewsFeed, NewsItem } from '../../../shared/types.js';

/**
 * Enough RSS 2.0 and Atom to pull headlines. Feeds are configured by hand, so
 * this trades generality for having no XML dependency on the Pi.
 */
export async function fetchNews(
  feeds: NewsFeed[],
  perFeed = 8,
): Promise<{ items: NewsItem[]; errors: string[] }> {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => parseFeed(await fetchText(feed.url, 15_000), feed.name, perFeed)),
  );

  const items: NewsItem[] = [];
  const errors: string[] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') items.push(...result.value);
    else errors.push(`${feeds[i]?.name ?? 'feed'}: ${message(result.reason)}`);
  });

  // Newest first, with undated items sinking to the bottom.
  items.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  return { items, errors };
}

function parseFeed(xml: string, source: string, limit: number): NewsItem[] {
  const entries = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  const out: NewsItem[] = [];

  for (const entry of entries.slice(0, limit)) {
    const body = entry[2] ?? '';
    const title = decode(tag(body, 'title') ?? '').trim();
    if (!title) continue;

    const link = extractLink(body);
    const published =
      tag(body, 'pubDate') ?? tag(body, 'published') ?? tag(body, 'updated') ?? tag(body, 'dc:date');

    out.push({
      id: `${source}:${tag(body, 'guid') ?? tag(body, 'id') ?? link ?? title}`,
      title,
      source,
      link: link ?? '',
      publishedAt: toIso(published),
    });
  }
  return out;
}

function tag(body: string, name: string): string | null {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i');
  return re.exec(body)?.[1]?.trim() ?? null;
}

/** RSS puts the URL in the element body; Atom puts it in an href attribute. */
function extractLink(body: string): string | null {
  const atom = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i.exec(body);
  if (atom?.[1]) return decode(atom[1]);
  const rss = tag(body, 'link');
  return rss ? decode(rss) : null;
}

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function toIso(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(decode(value));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
