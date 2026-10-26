import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGoal } from '../db/goals';
import { openDatabase } from '../db/database';
import { loadActiveSession } from '../db/sessions';
import { createTodo } from '../db/todos';
import {
  DEFAULT_SESSION_CONFIG,
  MS_PER_MINUTE,
  type SessionConfig,
  type SessionState
} from '../../shared/session';
import { SessionError } from '../../shared/sessionEngine';
import { HEARTBEAT_MS, SessionManager } from './sessionManager';

const T0 = 1_700_000_000_000;
const MIN = MS_PER_MINUTE;

let db: DatabaseSync;
let goalId: number;
let time: number;
let changes: SessionState[];

// A manager whose clock is the `time` variable and whose changes are collected in `changes`.
function newManager(): SessionManager {
  return new SessionManager(
    db,
    () => time,
    (state) => changes.push(state)
  );
}

function input(overrides: Partial<SessionConfig> = {}, todoId: number | null = null): unknown {
  return { goalId, todoId, config: { ...DEFAULT_SESSION_CONFIG, ...overrides } };
}

function savedRow(): { phase: string; focused_ms: number; end_reason: string | null } {
  return db
    .prepare('SELECT phase, focused_ms, end_reason FROM sessions ORDER BY id DESC LIMIT 1')
    .get() as { phase: string; focused_ms: number; end_reason: string | null };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  goalId = createGoal(db, {
    title: 'Goal',
    targetHours: 2,
    difficulty: 2,
    strictness: 'medium'
  }).id;
  time = T0;
  changes = [];
});

describe('create and start', () => {
  it('saves a prepared session and tells the listener', () => {
    const manager = newManager();

    const state = manager.create(input());

    expect(state.phase).toBe('prep');
    expect(changes).toEqual([state]);
    expect(savedRow().phase).toBe('prep');
    expect(manager.current()).toEqual(state);
  });

  it('starts the first focus round and saves it', () => {
    const manager = newManager();
    manager.create(input());
    time = T0 + 1000;

    const state = manager.start();

    expect(state).toMatchObject({ phase: 'focus', round: 1, startedAt: T0 + 1000 });
    expect(savedRow().phase).toBe('focus');
    expect(loadActiveSession(db)?.state).toEqual(state);
  });

  it('refuses a second session while one is unfinished', () => {
    const manager = newManager();
    manager.create(input());

    expect(() => manager.create(input())).toThrow('already running');
  });

  it('allows a new session after the last one was abandoned', () => {
    const manager = newManager();
    manager.create(input());
    manager.abandon();

    expect(() => manager.create(input())).not.toThrow();
  });

  it('rejects a goal that does not exist and invalid settings', () => {
    const manager = newManager();

    expect(() =>
      manager.create({ goalId: 9999, todoId: null, config: DEFAULT_SESSION_CONFIG })
    ).toThrow('Goal not found');
    expect(() => manager.create(input({ focusMinutes: 0 }))).toThrow(SessionError);
    expect(manager.current()).toBeNull();
  });

  it('accepts a task of the goal and rejects one from another goal', () => {
    const manager = newManager();
    const mine = createTodo(db, { goalId, title: 'Mine', estimatePomodoros: null });
    const otherGoal = createGoal(db, {
      title: 'Other',
      targetHours: 1,
      difficulty: 1,
      strictness: 'gentle'
    }).id;
    const theirs = createTodo(db, { goalId: otherGoal, title: 'Theirs', estimatePomodoros: null });

    expect(() => manager.create(input({}, theirs.id))).toThrow('Task not found for this goal');
    expect(manager.create(input({}, mine.id)).todoId).toBe(mine.id);
  });

  it('refuses actions when there is no session', () => {
    const manager = newManager();

    for (const action of [
      () => manager.start(),
      () => manager.pause(),
      () => manager.resume(),
      () => manager.abandon()
    ]) {
      expect(action).toThrow('There is no session');
    }
  });
});

describe('tick', () => {
  it('does nothing without a session', () => {
    const manager = newManager();

    expect(() => manager.tick()).not.toThrow();
    expect(changes).toEqual([]);
  });

  it('stays quiet while a phase is running', () => {
    const manager = newManager();
    manager.create(input());
    manager.start();
    changes = [];

    time = T0 + 10 * MIN;
    manager.tick();

    expect(changes).toEqual([]);
  });

  it('moves to the break when the round is due, once, and saves it', () => {
    const manager = newManager();
    manager.create(input());
    manager.start();
    changes = [];

    time = T0 + 25 * MIN;
    manager.tick();
    manager.tick();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ phase: 'break', round: 1, focusedMs: 25 * MIN });
    expect(savedRow().phase).toBe('break');
  });

  it('ends a finished session, saves the result and clears it', () => {
    const manager = newManager();
    manager.create(input({ rounds: 1 }));
    manager.start();
    changes = [];

    time = T0 + 25 * MIN;
    manager.tick();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ phase: 'ended', endReason: 'completed' });
    expect(savedRow()).toEqual({ phase: 'ended', focused_ms: 25 * MIN, end_reason: 'completed' });
    expect(manager.current()).toBeNull();
  });

  it('writes a heartbeat only once the interval has passed', () => {
    const manager = newManager();
    manager.create(input());
    manager.start();
    const lastSeen = (): number => loadActiveSession(db)?.lastSeenMs ?? -1;
    expect(lastSeen()).toBe(T0);

    time = T0 + HEARTBEAT_MS - 1;
    manager.tick();
    expect(lastSeen()).toBe(T0);

    time = T0 + HEARTBEAT_MS;
    manager.tick();
    expect(lastSeen()).toBe(T0 + HEARTBEAT_MS);
  });

  it('brings the session up to date when asked for the current one', () => {
    const manager = newManager();
    manager.create(input());
    manager.start();

    time = T0 + 30 * MIN;

    expect(manager.current()).toMatchObject({ phase: 'focus', round: 2 });
  });
});

describe('pause, resume and abandon', () => {
  it('pauses and resumes on gentle', () => {
    const manager = newManager();
    manager.create(input({ strictness: 'gentle' }));
    manager.start();

    time = T0 + 5 * MIN;
    expect(manager.pause().pausedAt).toBe(time);
    time = T0 + 20 * MIN;
    expect(manager.resume().pausedAt).toBeNull();
  });

  it('keeps the old state when the engine refuses', () => {
    const manager = newManager();
    manager.create(input({ strictness: 'hard' }));
    const started = manager.start();
    changes = [];

    expect(() => manager.pause()).toThrow('No pauses left');

    expect(changes).toEqual([]);
    expect(loadActiveSession(db)?.state).toEqual(started);
  });

  it('abandons, keeps the focus time done and clears the session', () => {
    const manager = newManager();
    manager.create(input());
    manager.start();

    time = T0 + 10 * MIN;
    const state = manager.abandon();

    expect(state).toMatchObject({ endReason: 'abandoned', focusedMs: 10 * MIN });
    expect(savedRow()).toEqual({ phase: 'ended', focused_ms: 10 * MIN, end_reason: 'abandoned' });
    expect(manager.current()).toBeNull();
  });
});

describe('recover after the app was closed', () => {
  it('finds nothing to recover on a clean start', () => {
    expect(newManager().recover()).toBeNull();
  });

  it('ends an unfinished session at its last heartbeat, not at the current time', () => {
    const first = newManager();
    first.create(input());
    first.start();
    time = T0 + 7 * MIN;
    first.tick();

    // The app is gone for three hours, then a new one starts.
    time = T0 + 3 * 60 * MIN;
    const second = newManager();
    const recovered = second.recover();

    expect(recovered).toMatchObject({
      phase: 'ended',
      endReason: 'abandoned',
      focusedMs: 7 * MIN,
      endedAt: T0 + 7 * MIN
    });
    expect(savedRow()).toEqual({ phase: 'ended', focused_ms: 7 * MIN, end_reason: 'abandoned' });
    expect(second.current()).toBeNull();
    expect(() => second.create(input())).not.toThrow();
  });

  it('counts the time up to a clean quit', () => {
    const first = newManager();
    first.create(input());
    first.start();
    time = T0 + 12 * MIN;
    first.flush();

    time = T0 + 5 * 60 * MIN;
    const recovered = newManager().recover();

    expect(recovered?.focusedMs).toBe(12 * MIN);
  });

  it('keeps a session that had already completed before the last heartbeat', () => {
    const first = newManager();
    first.create(input({ rounds: 1 }));
    first.start();
    // The round was due at minute 25, but nothing ticked before the app went away at minute 40.
    time = T0 + 40 * MIN;
    first.tick();
    const lastRow = savedRow();

    expect(lastRow.end_reason).toBe('completed');
    expect(newManager().recover()).toBeNull();
  });

  it('ends a session that was only being prepared with nothing focused', () => {
    const first = newManager();
    first.create(input());

    time = T0 + 60 * MIN;
    const recovered = newManager().recover();

    expect(recovered).toMatchObject({ endReason: 'abandoned', focusedMs: 0 });
  });

  it('counts a paused session only up to the pause', () => {
    const first = newManager();
    first.create(input({ strictness: 'gentle' }));
    first.start();
    time = T0 + 10 * MIN;
    first.pause();
    time = T0 + 40 * MIN;
    first.tick();

    time = T0 + 90 * MIN;
    const recovered = newManager().recover();

    expect(recovered?.focusedMs).toBe(10 * MIN);
  });
});

describe('telling the caller when a session ends', () => {
  let ended: { id: number; state: SessionState }[];

  beforeEach(() => {
    ended = [];
  });

  // A manager that also reports each ended session, like the app does to pay XP.
  function managerThatReportsEnds(): SessionManager {
    return new SessionManager(
      db,
      () => time,
      (state) => changes.push(state),
      (id, state) => ended.push({ id, state })
    );
  }

  function savedId(): number {
    return (db.prepare('SELECT id FROM sessions ORDER BY id DESC LIMIT 1').get() as { id: number })
      .id;
  }

  it('reports a completed session once, with its saved id', () => {
    const manager = managerThatReportsEnds();
    manager.create(input({ rounds: 1 }));
    manager.start();
    expect(ended).toEqual([]);

    time = T0 + 25 * MIN;
    manager.tick();
    manager.tick();

    expect(ended).toHaveLength(1);
    expect(ended[0].id).toBe(savedId());
    expect(ended[0].state).toMatchObject({ endReason: 'completed', focusedMs: 25 * MIN });
  });

  it('reports an abandoned session, and nothing while it is running', () => {
    const manager = managerThatReportsEnds();
    manager.create(input({ strictness: 'gentle' }));
    manager.start();
    time = T0 + 5 * MIN;
    manager.pause();
    manager.resume();
    expect(ended).toEqual([]);

    time = T0 + 10 * MIN;
    manager.abandon();

    expect(ended).toHaveLength(1);
    expect(ended[0].state).toMatchObject({ endReason: 'abandoned', focusedMs: 10 * MIN });
  });

  it('reports a session closed by recovery after a crash', () => {
    const first = managerThatReportsEnds();
    first.create(input());
    first.start();
    time = T0 + 7 * MIN;
    first.tick();

    time = T0 + 3 * 60 * MIN;
    managerThatReportsEnds().recover();

    expect(ended).toHaveLength(1);
    expect(ended[0].state).toMatchObject({ endReason: 'abandoned', focusedMs: 7 * MIN });
  });

  it('keeps the session intact even if the caller throws', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const manager = new SessionManager(
      db,
      () => time,
      (state) => changes.push(state),
      () => {
        throw new Error('payout failed');
      }
    );
    manager.create(input());
    manager.start();
    changes = [];

    time = T0 + 10 * MIN;
    const state = manager.abandon();

    expect(state.phase).toBe('ended');
    expect(savedRow()).toMatchObject({ phase: 'ended', end_reason: 'abandoned' });
    expect(changes).toHaveLength(1);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});
