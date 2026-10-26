import type { DatabaseSync } from 'node:sqlite';
import { isValidId } from '../../shared/todo';
import type { SessionState } from '../../shared/session';
import {
  SessionError,
  abandonSession,
  advance,
  createSession,
  pauseSession,
  resumeSession,
  startSession
} from '../../shared/sessionEngine';
import { insertSession, loadActiveSession, saveSession, touchSession } from '../db/sessions';

// How often the app records that it is still alive while a session is open.
export const HEARTBEAT_MS = 15_000;

interface ActiveSession {
  id: number;
  state: SessionState;
}

// Owns the one unfinished session. It applies the pure engine to the saved state, saves every
// change, and tells the listener whenever the state changes. The clock is passed in so tests
// do not have to wait.
export class SessionManager {
  private active: ActiveSession | null = null;
  private lastSavedAt = 0;
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly onChange: (state: SessionState) => void;

  constructor(
    db: DatabaseSync,
    now: () => number = Date.now,
    onChange: (state: SessionState) => void = () => {}
  ) {
    this.db = db;
    this.now = now;
    this.onChange = onChange;
  }

  // Runs once at startup. A session left unfinished means the app was closed or crashed, and
  // the time since the last heartbeat must not count as focus, so it ends there as abandoned.
  recover(): SessionState | null {
    const stored = loadActiveSession(this.db);
    if (!stored) {
      return null;
    }

    const caughtUp = advance(stored.state, stored.lastSeenMs);
    const final =
      caughtUp.phase === 'ended' ? caughtUp : abandonSession(caughtUp, stored.lastSeenMs);
    saveSession(this.db, stored.id, final, this.now());
    return final;
  }

  // The unfinished session brought up to date, or null if there is none.
  current(): SessionState | null {
    this.tick();
    return this.active?.state ?? null;
  }

  // Starts preparing a session for a goal and, optionally, one of its tasks.
  create(input: unknown): SessionState {
    if (this.active) {
      throw new SessionError('A session is already running');
    }

    const state = createSession(input);
    this.checkReferences(state);

    const now = this.now();
    const id = insertSession(this.db, state, now);
    return this.commit({ id, state }, now);
  }

  start(): SessionState {
    return this.apply(startSession);
  }

  pause(): SessionState {
    return this.apply(pauseSession);
  }

  resume(): SessionState {
    return this.apply(resumeSession);
  }

  abandon(): SessionState {
    return this.apply(abandonSession);
  }

  // Called about once a second. It moves the session on when a phase is due and saves a
  // heartbeat now and then, so a crash loses at most a few seconds of focus time.
  tick(): void {
    if (!this.active) {
      return;
    }

    const now = this.now();
    const next = advance(this.active.state, now);

    if (next !== this.active.state) {
      this.commit({ id: this.active.id, state: next }, now);
    } else if (now - this.lastSavedAt >= HEARTBEAT_MS) {
      touchSession(this.db, this.active.id, now);
      this.lastSavedAt = now;
    }
  }

  // Called when the app is about to quit: brings the session up to date and records that it
  // was alive right now, so the time up to this moment is the last time that can count.
  flush(): void {
    this.tick();
    if (this.active) {
      touchSession(this.db, this.active.id, this.now());
    }
  }

  // The goal must exist, and the task must belong to that goal.
  private checkReferences(state: SessionState): void {
    const goal = this.db.prepare('SELECT 1 AS found FROM goals WHERE id = ?').get(state.goalId);
    if (!goal) {
      throw new SessionError('Goal not found');
    }

    if (state.todoId !== null && isValidId(state.todoId)) {
      const todo = this.db
        .prepare('SELECT 1 AS found FROM todos WHERE id = ? AND goal_id = ?')
        .get(state.todoId, state.goalId);
      if (!todo) {
        throw new SessionError('Task not found for this goal');
      }
    }
  }

  // Applies one engine transition to the active session. If the engine refuses, nothing
  // is saved and the state stays as it was.
  private apply(transition: (state: SessionState, now: number) => SessionState): SessionState {
    if (!this.active) {
      throw new SessionError('There is no session');
    }

    const now = this.now();
    const next = transition(this.active.state, now);
    return this.commit({ id: this.active.id, state: next }, now);
  }

  // Saves the new state, keeps it as the active one unless it ended, and tells the listener.
  private commit(session: ActiveSession, now: number): SessionState {
    saveSession(this.db, session.id, session.state, now);
    this.lastSavedAt = now;
    this.active = session.state.phase === 'ended' ? null : session;
    this.onChange(session.state);
    return session.state;
  }
}
