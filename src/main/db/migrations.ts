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
  },
  {
    version: 3,
    sql: `
      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
        todo_id INTEGER REFERENCES todos (id) ON DELETE SET NULL,
        state TEXT NOT NULL,
        phase TEXT NOT NULL CHECK (phase IN ('prep', 'focus', 'break', 'ended')),
        focused_ms INTEGER NOT NULL DEFAULT 0 CHECK (focused_ms >= 0),
        end_reason TEXT CHECK (end_reason IN ('completed', 'abandoned')),
        last_seen_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX idx_sessions_goal ON sessions (goal_id, id);

      -- At most one session can be unfinished at a time. The index is on a constant, so any
      -- second row that is not 'ended' collides with the first.
      CREATE UNIQUE INDEX idx_sessions_one_active ON sessions ((1)) WHERE phase <> 'ended';
    `
  },
  {
    version: 4,
    sql: `
      -- One pet at a time: the id is always 1, so a second pet cannot be inserted.
      CREATE TABLE pets (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        species TEXT NOT NULL CHECK (species IN ('ember', 'tide', 'leaf')),
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 20),
        chosen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      -- Every XP payout. The pet's XP is the sum of these rows. A session or a task can pay out
      -- only once, because (source, ref_id) is unique.
      CREATE TABLE xp_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL CHECK (source IN ('session', 'task')),
        ref_id INTEGER NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (source, ref_id)
      );
    `
  },
  {
    version: 5,
    sql: `
      -- Every run, active or finished. The finished ones are the run history.
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
        state TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'failed', 'completed', 'abandoned')),
        seed INTEGER NOT NULL,
        stages_total INTEGER NOT NULL CHECK (stages_total >= 1),
        stage_reached INTEGER NOT NULL CHECK (stage_reached >= 1),
        stages_cleared INTEGER NOT NULL DEFAULT 0 CHECK (stages_cleared >= 0),
        start_day TEXT NOT NULL,
        end_day TEXT,
        -- A run that failed or was won stays unseen until the person has read its result.
        seen INTEGER NOT NULL DEFAULT 1 CHECK (seen IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX idx_runs_goal ON runs (goal_id, id);

      -- At most one run can be active at a time. The index is on a constant, so a second row
      -- with status 'active' collides with the first.
      CREATE UNIQUE INDEX idx_runs_one_active ON runs ((1)) WHERE status = 'active';
    `
  },
  {
    version: 6,
    sql: `
      -- How many times each blocked app became a distraction. Only the app's name and a count are
      -- kept, never window titles and never when it happened.
      CREATE TABLE distraction_counts (
        app TEXT PRIMARY KEY CHECK (length(app) BETWEEN 1 AND 100),
        count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0)
      );
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
