import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_CONFIG, MS_PER_MINUTE, type SessionState } from '../../shared/session';
import { abandonSession, createSession, startSession } from '../../shared/sessionEngine';
import { openDatabase } from './database';
import { createGoal } from './goals';
import { insertSession, loadActiveSession, saveSession, touchSession } from './sessions';
import { createTodo } from './todos';

const T0 = 1_700_000_000_000;

let db: DatabaseSync;
let goalId: number;

function newState(todoId: number | null = null): SessionState {
  return createSession({ goalId, todoId, config: DEFAULT_SESSION_CONFIG });
}

beforeEach(() => {
  db = openDatabase(':memory:');
  goalId = createGoal(db, {
    title: 'Goal',
    targetHours: 2,
    difficulty: 2,
    strictness: 'medium'
  }).id;
});

describe('insertSession and loadActiveSession', () => {
  it('saves a session and loads it back exactly', () => {
    const state = startSession(newState(), T0);
    const id = insertSession(db, state, T0 + 5);

    const stored = loadActiveSession(db);

    expect(stored).toEqual({ id, state, lastSeenMs: T0 + 5 });
  });

  it('returns null when there is no unfinished session', () => {
    expect(loadActiveSession(db)).toBeNull();
  });

  it('allows only one unfinished session at a time', () => {
    insertSession(db, newState(), T0);

    expect(() => insertSession(db, newState(), T0)).toThrow();
  });

  it('allows a new session once the previous one ended', () => {
    const state = startSession(newState(), T0);
    const id = insertSession(db, state, T0);
    saveSession(db, id, abandonSession(state, T0 + MS_PER_MINUTE), T0 + MS_PER_MINUTE);

    expect(loadActiveSession(db)).toBeNull();
    expect(() => insertSession(db, newState(), T0 + 2 * MS_PER_MINUTE)).not.toThrow();
  });

  it('rejects a session for a goal that does not exist', () => {
    const state = createSession({ goalId: 9999, todoId: null, config: DEFAULT_SESSION_CONFIG });

    expect(() => insertSession(db, state, T0)).toThrow();
  });
});

describe('saveSession and touchSession', () => {
  it('updates the state and the columns kept for queries', () => {
    const started = startSession(newState(), T0);
    const id = insertSession(db, started, T0);
    const ended = abandonSession(started, T0 + 10 * MS_PER_MINUTE);

    saveSession(db, id, ended, T0 + 10 * MS_PER_MINUTE);

    const row = db
      .prepare('SELECT phase, focused_ms, end_reason FROM sessions WHERE id = ?')
      .get(id) as { phase: string; focused_ms: number; end_reason: string };
    expect(row).toEqual({
      phase: 'ended',
      focused_ms: 10 * MS_PER_MINUTE,
      end_reason: 'abandoned'
    });
  });

  it('records a heartbeat without touching the state', () => {
    const state = startSession(newState(), T0);
    const id = insertSession(db, state, T0);

    touchSession(db, id, T0 + 60_000);

    expect(loadActiveSession(db)).toEqual({ id, state, lastSeenMs: T0 + 60_000 });
  });
});

describe('damaged rows', () => {
  function insertRaw(stateText: string): void {
    db.prepare(
      "INSERT INTO sessions (goal_id, state, phase, last_seen_ms) VALUES (?, ?, 'focus', 1)"
    ).run(goalId, stateText);
  }

  // Each case builds its text when the test runs, because the goal only exists by then.
  it.each([
    ['text that is not JSON', () => 'not json at all'],
    ['JSON of the wrong type', () => '"hello"'],
    ['null', () => 'null'],
    ['an object missing fields', () => '{"goalId":1}'],
    [
      'a state with a bad phase',
      () => JSON.stringify({ ...startSession(newState(), T0), phase: 'sleeping' })
    ],
    [
      'a state with invalid settings',
      () =>
        JSON.stringify({
          ...startSession(newState(), T0),
          config: { ...DEFAULT_SESSION_CONFIG, focusMinutes: 0 }
        })
    ]
  ])('closes a row holding %s so it cannot block new sessions', (_name, makeText) => {
    insertRaw(makeText());

    expect(loadActiveSession(db)).toBeNull();

    const row = db.prepare('SELECT phase, end_reason FROM sessions').get() as {
      phase: string;
      end_reason: string;
    };
    expect(row).toEqual({ phase: 'ended', end_reason: 'abandoned' });
    expect(() => insertSession(db, newState(), T0)).not.toThrow();
  });
});

describe('relations', () => {
  it('is removed together with its goal', () => {
    insertSession(db, newState(), T0);

    db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);

    const left = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
    expect(left.n).toBe(0);
  });

  it('keeps the session but forgets the task when the task is deleted', () => {
    const todo = createTodo(db, { goalId, title: 'Task', estimatePomodoros: null });
    const id = insertSession(db, newState(todo.id), T0);

    db.prepare('DELETE FROM todos WHERE id = ?').run(todo.id);

    const row = db.prepare('SELECT todo_id FROM sessions WHERE id = ?').get(id) as {
      todo_id: number | null;
    };
    expect(row.todo_id).toBeNull();
  });
});
