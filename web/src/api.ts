import type { BootstrapPayload, DashboardState } from '../../shared/types.js';

export async function bootstrap(): Promise<BootstrapPayload> {
  const res = await fetch('/api/bootstrap');
  if (!res.ok) throw new Error(`bootstrap failed: HTTP ${res.status}`);
  return (await res.json()) as BootstrapPayload;
}

type StateHandler = (state: DashboardState) => void;
type StatusHandler = (online: boolean) => void;

/**
 * The screen must survive the router rebooting at 3am with nobody watching, so
 * the stream reconnects forever with a bounded backoff.
 */
export function subscribe(onState: StateHandler, onStatus: StatusHandler): void {
  let source: EventSource | null = null;
  let delay = 1000;

  const connect = () => {
    source?.close();
    source = new EventSource('/api/stream');

    source.addEventListener('open', () => {
      delay = 1000;
      onStatus(true);
    });

    source.addEventListener('state', (event) => {
      try {
        onState(JSON.parse((event as MessageEvent<string>).data) as DashboardState);
        onStatus(true);
      } catch {
        // A truncated frame is not worth tearing the connection down for.
      }
    });

    source.addEventListener('error', () => {
      onStatus(false);
      source?.close();
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    });
  };

  connect();

  // A Pi that suspends its network comes back with a dead EventSource that
  // never fires 'error'; reconnecting on visibility covers that case.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && source?.readyState === EventSource.CLOSED) {
      connect();
    }
  });
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${method} ${path} failed: HTTP ${res.status} ${detail}`.trim());
  }
  return (await res.json()) as T;
}

export const api = {
  addItem: (listId: string, text: string, addedBy?: string) =>
    send('POST', `/api/lists/${encodeURIComponent(listId)}/items`, { text, addedBy }),
  setItemDone: (id: number, done: boolean) => send('PATCH', `/api/lists/items/${id}`, { done }),
  deleteItem: (id: number) => send('DELETE', `/api/lists/items/${id}`),
  clearDone: (listId: string) => send('POST', `/api/lists/${encodeURIComponent(listId)}/clear`),

  addReminder: (text: string, dueAt: string | null, repeat: string, assignee?: string) =>
    send('POST', '/api/reminders', { text, dueAt, repeat, assignee }),
  completeReminder: (id: number, done: boolean) => send('PATCH', `/api/reminders/${id}`, { done }),
  deleteReminder: (id: number) => send('DELETE', `/api/reminders/${id}`),

  refresh: () => send('POST', '/api/refresh'),
};
