import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config.js';
import {
  addListItem,
  addReminder,
  clearDone,
  completeReminder,
  deleteListItem,
  deleteReminder,
  editListItem,
  setListItemDone,
} from '../db.js';
import { bus, buildState, publish, refreshAll } from '../store.js';
import type { BootstrapPayload, DashboardState, ReminderRepeat } from '../../../shared/types.js';

const REPEATS: ReminderRepeat[] = ['none', 'daily', 'weekly', 'monthly'];

/** Wall-mounted screens have no keyboard; keep the failure modes loud in logs. */
export async function registerApi(app: FastifyInstance): Promise<void> {
  app.get('/api/bootstrap', async (): Promise<BootstrapPayload> => {
    return { config: loadConfig(), state: buildState() };
  });

  app.get('/api/state', async (): Promise<DashboardState> => buildState());

  app.get('/api/health', async () => {
    const state = buildState();
    const ok = state.health.every((h) => h.ok || h.lastSuccess === null);
    return { ok, sources: state.health, generatedAt: state.generatedAt };
  });

  app.post('/api/refresh', async () => {
    await refreshAll();
    return { ok: true };
  });

  /* ---------------- Server-sent events ---------------- */

  app.get('/api/stream', (request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const send = (state: DashboardState) => {
      reply.raw.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    };

    send(buildState());
    bus.on('state', send);

    // Proxies and phones drop idle connections; a comment frame keeps it warm.
    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    keepAlive.unref();

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      bus.off('state', send);
    });
  });

  /* ---------------- Lists ---------------- */

  app.post<{ Params: { listId: string }; Body: { text?: string; note?: string; addedBy?: string } }>(
    '/api/lists/:listId/items',
    async (request, reply) => {
      const text = (request.body?.text ?? '').trim();
      if (!text) return reply.code(400).send({ error: 'text is required' });

      const item = addListItem(
        request.params.listId,
        text,
        request.body?.note?.trim() || null,
        request.body?.addedBy?.trim() || null,
      );
      publish();
      return item;
    },
  );

  app.patch<{ Params: { id: string }; Body: { done?: boolean; text?: string; note?: string } }>(
    '/api/lists/items/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'bad id' });

      let updated = null;
      if (typeof request.body?.text === 'string') {
        updated = editListItem(id, request.body.text.trim(), request.body.note?.trim() || null);
      }
      if (typeof request.body?.done === 'boolean') {
        updated = setListItemDone(id, request.body.done);
      }
      if (!updated) return reply.code(404).send({ error: 'not found' });

      publish();
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>('/api/lists/items/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'bad id' });
    if (!deleteListItem(id)) return reply.code(404).send({ error: 'not found' });
    publish();
    return { ok: true };
  });

  app.post<{ Params: { listId: string } }>('/api/lists/:listId/clear', async (request) => {
    const removed = clearDone(request.params.listId);
    publish();
    return { ok: true, removed };
  });

  /* ---------------- Reminders ---------------- */

  app.post<{
    Body: { text?: string; dueAt?: string; repeat?: string; assignee?: string };
  }>('/api/reminders', async (request, reply) => {
    const text = (request.body?.text ?? '').trim();
    if (!text) return reply.code(400).send({ error: 'text is required' });

    const repeat = REPEATS.includes(request.body?.repeat as ReminderRepeat)
      ? (request.body!.repeat as ReminderRepeat)
      : 'none';

    let dueAt: string | null = null;
    if (request.body?.dueAt) {
      const ms = Date.parse(request.body.dueAt);
      if (Number.isNaN(ms)) return reply.code(400).send({ error: 'dueAt is not a date' });
      dueAt = new Date(ms).toISOString();
    }

    const reminder = addReminder(text, dueAt, repeat, request.body?.assignee?.trim() || null);
    publish();
    return reminder;
  });

  app.patch<{ Params: { id: string }; Body: { done?: boolean } }>(
    '/api/reminders/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) return reply.code(400).send({ error: 'bad id' });

      const updated = completeReminder(id, request.body?.done ?? true);
      if (!updated) return reply.code(404).send({ error: 'not found' });
      publish();
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>('/api/reminders/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'bad id' });
    if (!deleteReminder(id)) return reply.code(404).send({ error: 'not found' });
    publish();
    return { ok: true };
  });
}
