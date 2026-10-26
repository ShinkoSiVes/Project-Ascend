import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  version: number;
  sql: string;
}

// Each migration runs once, in order. Never edit a shipped migration; add a new one instead.
export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
        target_hours REAL NOT NULL CHECK (target_hours BETWEEN 0.5 AND 1000),
        difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
        strictness TEXT NOT NULL CHECK (strictness IN ('gentle', 'medium', 'hard')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `
  },
  {
    version: 2,
    sql: `
      CREATE TABLE todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
        estimate_pomodoros INTEGER CHECK (estimate_pomodoros BETWEEN 1 AND 99),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
        position INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        completed_at TEXT
      );

      CREATE INDEX idx_todos_goal_position ON todos (goal_id, position);
    `
  }
];

// Applies every migration newer than the database's schema version (SQLite's user_version).
export function runMigrations(db: DatabaseSync, list: Migration[] = migrations): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  const pending = list.filter((m) => m.version > current).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    // The migration and its version bump commit together, or not at all.
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
