import type { DatabaseSync } from 'node:sqlite';
import {
  MAX_APP_NAME_LENGTH,
  checkBlocklist,
  defaultBlocklist,
  normalizeApp,
  normalizeBlocklist
} from '../../shared/distraction';

const BLOCKLIST_KEY = 'blocklist';

// One row of the counts: an app and how many times it became a distraction.
export interface DistractionCount {
  app: string;
  count: number;
}

// The blocklist, as app names in their plain form. It is the default list if it was never saved
// or the saved text is damaged.
export function getBlocklist(db: DatabaseSync): string[] {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(BLOCKLIST_KEY) as
    { value: string } | undefined;
  if (!row) {
    return defaultBlocklist();
  }

  try {
    const saved: unknown = JSON.parse(row.value);
    return checkBlocklist(saved) === null
      ? normalizeBlocklist(saved as string[])
      : defaultBlocklist();
  } catch {
    return defaultBlocklist();
  }
}

// Saves the blocklist. A list that does not pass the check is refused instead of being saved.
export function setBlocklist(db: DatabaseSync, entries: unknown): string[] {
  const problem = checkBlocklist(entries);
  if (problem !== null) {
    throw new Error(problem);
  }

  const list = normalizeBlocklist(entries as string[]);
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(BLOCKLIST_KEY, JSON.stringify(list));
  return list;
}

// Adds one to an app's count. Only the name is kept, and a blank or too long one is ignored.
export function recordDistraction(db: DatabaseSync, app: string): void {
  const name = normalizeApp(app);
  if (name === '' || name.length > MAX_APP_NAME_LENGTH) {
    return;
  }

  db.prepare(
    `INSERT INTO distraction_counts (app, count) VALUES (?, 1)
     ON CONFLICT (app) DO UPDATE SET count = count + 1`
  ).run(name);
}

// Every app with its count, the most frequent first.
export function listDistractionCounts(db: DatabaseSync): DistractionCount[] {
  return db
    .prepare('SELECT app, count FROM distraction_counts ORDER BY count DESC, app ASC')
    .all() as unknown as DistractionCount[];
}
