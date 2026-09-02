const DEFAULT_TIMEOUT_MS = 12_000;

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

async function request(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'magic-dashboard/0.1 (+https://github.com/ldsflex/magic)',
        accept: 'application/json, text/xml, text/calendar, */*',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new HttpError(`${url} -> HTTP ${res.status}`, res.status);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const res = await request(url, timeoutMs);
  return (await res.json()) as T;
}

export async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const res = await request(url, timeoutMs);
  return await res.text();
}

/** Serialise query params without hand-rolling `&` chains at every call site. */
export function url(base: string, params: Record<string, string | number | string[]>): string {
  const u = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    u.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return u.toString();
}
