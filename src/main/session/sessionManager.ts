import type { DatabaseSync } from 'node:sqlite';
import { isValidId } from '../../shared/todo';
import { AWAY_AFTER_SECONDS, type SessionState } from '../../shared/session';
import {
  SessionError,
  abandonSession,
  advance,
  comeBack,
  createSession,
  goAway,
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

export interface SessionManagerOptions {
  // The clock, replaced in tests so they do not have to wait.
  now?: () => number;
  // Hears every new state.
  onChange?: (state: SessionState) => void;
  // Hears each session once, when it has ended, with its saved id, so the caller can pay out XP.
  onEnded?: (id: number, state: SessionState) => void;
  // How many milliseconds ago the keyboard or mouse was last used. Left out, nobody is ever away.
  idleMs?: () => number;
  // After how many milliseconds without input the person counts as away.
  awayAfterMs?: () => number;
}

// Owns the one unfinished session. It applies the pure engine to the saved state, saves every
// change, and tells the listener whenever the state changes. The clock and the idle time are
// passed in so tests do not have to wait.
export class SessionManager {
  private active: ActiveSession | null = null;
  private lastSavedAt = 0;
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly onChange: (state: SessionState) => void;
  private readonly onEnded: (id: number, state: SessionState) => void;
  private readonly idleMs: () => number;
  private readonly awayAfterMs: () => number;

  constructor(db: DatabaseSync, options: SessionManagerOptions = {}) {
    this.db = db;
    this.now = options.now ?? Date.now;
    this.onChange = options.onChange ?? (() => {});
    this.onEnded = options.onEnded ?? (() => {});
    this.idleMs = options.idleMs ?? (() => 0);
    this.awayAfterMs = options.awayAfterMs ?? (() => AWAY_AFTER_SECONDS * 1000);
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
    this.notifyEnded(stored.id, final);
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

  // Called about once a second. It stops the clock when nobody has touched the keyboard or
  // mouse for a while, starts it again on input, moves the session on when a phase is due, and
  // saves a heartbeat now and then, so a crash loses at most a few seconds of focus time.
  tick(): void {
    if (!this.active) {
      return;
    }

    const now = this.now();
    // Being away is settled first. If the time was settled first, a round that came due while
    // the person was away would be completed for them.
    const next = advance(this.applyAway(this.active.state, now), now);

    if (next !== this.active.state) {
      this.commit({ id: this.active.id, state: next }, now);
    } else if (now - this.lastSavedAt >= HEARTBEAT_MS) {
      touchSession(this.db, this.active.id, now);
      this.lastSavedAt = now;
    }
  }

  // Stops the focus clock once there has been no input for long enough, as of the moment the
  // input stopped, and starts it again as soon as there is input.
  private applyAway(state: SessionState, now: number): SessionState {
    const idle = this.idleMs();
    const away = idle >= this.awayAfterMs();

    if (state.awaySince !== null) {
      return away ? state : comeBack(state, now);
    }
    return away ? goAway(state, now - idle, now) : state;
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
    if (session.state.phase === 'ended') {
      this.notifyEnded(session.id, session.state);
    }
    this.onChange(session.state);
    return session.state;
  }

  // A failure while paying out must never break the session itself, which is already saved.
  private notifyEnded(id: number, state: SessionState): void {
    try {
      this.onEnded(id, state);
    } catch (error) {
      console.error('Handling the end of a session failed', error);
    }
  }
}
