import type { DatabaseSync } from 'node:sqlite';
import { checkSessionConfig, PHASES, type SessionState } from '../../shared/session';
import { isValidId } from '../../shared/todo';

// A session row as the app uses it: the engine state plus when the app last saw it alive.
export interface StoredSession {
  id: number;
  state: SessionState;
  lastSeenMs: number;
}

// Parses saved JSON, returning null instead of throwing when the text is damaged.
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// A session saved before the away state existed has no away fields. It is given the plain
// defaults, so an update does not close a session that was in the middle of running.
function withAwayFields(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }
  return { awaySince: null, awayMs: 0, ...value };
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

// Guards against a damaged row: the saved JSON must have the shape the engine expects.
function isSessionState(value: unknown): value is SessionState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const state = value as Record<string, unknown>;
  const config = state.config;

  return (
    isValidId(state.goalId) &&
    (state.todoId === null || isValidId(state.todoId)) &&
    typeof config === 'object' &&
    config !== null &&
    Object.keys(checkSessionConfig(config as Record<string, unknown>)).length === 0 &&
    (PHASES as readonly string[]).includes(state.phase as string) &&
    [
      state.round,
      state.elapsedBeforeSegment,
      state.pausesUsed,
      state.awayMs,
      state.focusedMs
    ].every((field) => typeof field === 'number' && Number.isFinite(field)) &&
    [state.segmentStartedAt, state.pausedAt, state.awaySince, state.startedAt, state.endedAt].every(
      isNumberOrNull
    ) &&
    (state.endReason === null || state.endReason === 'completed' || state.endReason === 'abandoned')
  );
}

// Saves a new session and returns its id. Fails if another session is still unfinished.
export function insertSession(db: DatabaseSync, state: SessionState, now: number): number {
  const row = db
    .prepare(
      `INSERT INTO sessions (goal_id, todo_id, state, phase, focused_ms, end_reason, last_seen_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(
      state.goalId,
      state.todoId,
      JSON.stringify(state),
      state.phase,
      Math.round(state.focusedMs),
      state.endReason,
      now
    ) as { id: number };
  return row.id;
}

// Saves a changed state. The columns next to the JSON are copies kept for queries.
export function saveSession(db: DatabaseSync, id: number, state: SessionState, now: number): void {
  db.prepare(
    `UPDATE sessions
     SET state = ?, phase = ?, focused_ms = ?, end_reason = ?, last_seen_ms = ?
     WHERE id = ?`
  ).run(JSON.stringify(state), state.phase, Math.round(state.focusedMs), state.endReason, now, id);
}

// Records that the app was alive at this moment, without changing the state.
export function touchSession(db: DatabaseSync, id: number, now: number): void {
  db.prepare('UPDATE sessions SET last_seen_ms = ? WHERE id = ?').run(now, id);
}

// Returns the unfinished session, if there is one.
export function loadActiveSession(db: DatabaseSync): StoredSession | null {
  const row = db
    .prepare("SELECT id, state, last_seen_ms FROM sessions WHERE phase <> 'ended'")
    .get() as unknown as { id: number; state: string; last_seen_ms: number } | undefined;
  if (!row) {
    return null;
  }

  const parsed = withAwayFields(parseJson(row.state));
  if (!isSessionState(parsed)) {
    // A damaged row would block every new session through the one-active-session index,
    // so it is closed instead of being left in the way.
    db.prepare("UPDATE sessions SET phase = 'ended', end_reason = 'abandoned' WHERE id = ?").run(
      row.id
    );
    return null;
  }

  return { id: row.id, state: parsed, lastSeenMs: row.last_seen_ms };
}
