import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR } from './config.js';
import type { ListItem, Reminder, ReminderRepeat } from '../../shared/types.js';

mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(resolve(DATA_DIR, 'magic.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS list_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id      TEXT    NOT NULL,
    text         TEXT    NOT NULL,
    note         TEXT,
    done         INTEGER NOT NULL DEFAULT 0,
    added_by     TEXT,
    created_at   TEXT    NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS list_items_by_list ON list_items (list_id, done, id);

  CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL,
    due_at     TEXT,
    repeat     TEXT    NOT NULL DEFAULT 'none',
    assignee   TEXT,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cache (
    key        TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
`);

interface ListRow {
  id: number;
  list_id: string;
  text: string;
  note: string | null;
  done: number;
  added_by: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ReminderRow {
  id: number;
  text: string;
  due_at: string | null;
  repeat: string;
  assignee: string | null;
  done: number;
  created_at: string;
}

const toListItem = (r: ListRow): ListItem => ({
  id: r.id,
  listId: r.list_id,
  text: r.text,
  note: r.note,
  done: r.done === 1,
  addedBy: r.added_by,
  createdAt: r.created_at,
  completedAt: r.completed_at,
});

const toReminder = (r: ReminderRow): Reminder => ({
  id: r.id,
  text: r.text,
  dueAt: r.due_at,
  repeat: r.repeat as ReminderRepeat,
  assignee: r.assignee,
  done: r.done === 1,
  createdAt: r.created_at,
});

/* ---------------------------------------------------------------- */
/* Lists                                                             */
/* ---------------------------------------------------------------- */

const qAllItems = db.prepare<[], ListRow>(
  `SELECT * FROM list_items ORDER BY done ASC, id ASC`,
);
const qAddItem = db.prepare(
  `INSERT INTO list_items (list_id, text, note, added_by, created_at)
   VALUES (?, ?, ?, ?, ?)`,
);
const qItem = db.prepare<[number], ListRow>(`SELECT * FROM list_items WHERE id = ?`);
const qSetDone = db.prepare(`UPDATE list_items SET done = ?, completed_at = ? WHERE id = ?`);
const qEditItem = db.prepare(`UPDATE list_items SET text = ?, note = ? WHERE id = ?`);
const qDeleteItem = db.prepare(`DELETE FROM list_items WHERE id = ?`);
const qClearDone = db.prepare(`DELETE FROM list_items WHERE list_id = ? AND done = 1`);

/** All lists at once, keyed by list id — the dashboard renders several. */
export function allLists(): Record<string, ListItem[]> {
  const out: Record<string, ListItem[]> = {};
  for (const row of qAllItems.all()) {
    const item = toListItem(row);
    (out[item.listId] ??= []).push(item);
  }
  return out;
}

export function addListItem(
  listId: string,
  text: string,
  note: string | null,
  addedBy: string | null,
): ListItem {
  const info = qAddItem.run(listId, text, note, addedBy, new Date().toISOString());
  return toListItem(qItem.get(Number(info.lastInsertRowid))!);
}

export function setListItemDone(id: number, done: boolean): ListItem | null {
  qSetDone.run(done ? 1 : 0, done ? new Date().toISOString() : null, id);
  const row = qItem.get(id);
  return row ? toListItem(row) : null;
}

export function editListItem(id: number, text: string, note: string | null): ListItem | null {
  qEditItem.run(text, note, id);
  const row = qItem.get(id);
  return row ? toListItem(row) : null;
}

export function deleteListItem(id: number): boolean {
  return qDeleteItem.run(id).changes > 0;
}

export function clearDone(listId: string): number {
  return qClearDone.run(listId).changes;
}

/* ---------------------------------------------------------------- */
/* Reminders                                                         */
/* ---------------------------------------------------------------- */

const qReminders = db.prepare<[], ReminderRow>(
  `SELECT * FROM reminders ORDER BY done ASC, (due_at IS NULL) ASC, due_at ASC, id ASC`,
);
const qAddReminder = db.prepare(
  `INSERT INTO reminders (text, due_at, repeat, assignee, created_at) VALUES (?, ?, ?, ?, ?)`,
);
const qReminder = db.prepare<[number], ReminderRow>(`SELECT * FROM reminders WHERE id = ?`);
const qReminderDone = db.prepare(`UPDATE reminders SET done = ?, due_at = ? WHERE id = ?`);
const qDeleteReminder = db.prepare(`DELETE FROM reminders WHERE id = ?`);

export function allReminders(): Reminder[] {
  return qReminders.all().map(toReminder);
}

export function addReminder(
  text: string,
  dueAt: string | null,
  repeat: ReminderRepeat,
  assignee: string | null,
): Reminder {
  const info = qAddReminder.run(text, dueAt, repeat, assignee, new Date().toISOString());
  return toReminder(qReminder.get(Number(info.lastInsertRowid))!);
}

/**
 * Completing a repeating reminder rolls it forward instead of closing it —
 * the bins do not stop needing to go out.
 */
export function completeReminder(id: number, done: boolean): Reminder | null {
  const row = qReminder.get(id);
  if (!row) return null;
  const current = toReminder(row);

  if (done && current.repeat !== 'none' && current.dueAt) {
    qReminderDone.run(0, rollForward(current.dueAt, current.repeat), id);
  } else {
    qReminderDone.run(done ? 1 : 0, current.dueAt, id);
  }
  return toReminder(qReminder.get(id)!);
}

export function deleteReminder(id: number): boolean {
  return qDeleteReminder.run(id).changes > 0;
}

function rollForward(iso: string, repeat: ReminderRepeat): string {
  const d = new Date(iso);
  const now = Date.now();
  // Skip any occurrences already missed, so a neglected chore lands on the
  // next real date rather than staying permanently overdue.
  do {
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else break;
  } while (d.getTime() <= now);
  return d.toISOString();
}

/* ---------------------------------------------------------------- */
/* Upstream response cache                                           */
/* ---------------------------------------------------------------- */

const qGetCache = db.prepare<[string], { payload: string; fetched_at: string }>(
  `SELECT payload, fetched_at FROM cache WHERE key = ?`,
);
const qPutCache = db.prepare(
  `INSERT INTO cache (key, payload, fetched_at) VALUES (?, ?, ?)
   ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
);

export function readCache<T>(key: string): { value: T; fetchedAt: string } | null {
  const row = qGetCache.get(key);
  if (!row) return null;
  try {
    return { value: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  qPutCache.run(key, JSON.stringify(value), new Date().toISOString());
}
