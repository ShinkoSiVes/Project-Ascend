// The session state machine: prep -> focus <-> break -> ended.
// Every function is pure. It takes the current state and the time (epoch ms) and returns a
// new state, never changing the old one and never reading the clock, so it can be tested
// without waiting and a state can be saved and restored at any moment.

import {
  checkSessionConfig,
  elapsedMs,
  isValidTodoRef,
  MS_PER_MINUTE,
  PAUSE_RULES,
  pausesLeft,
  phaseDurationMs,
  type SessionConfig,
  type SessionState
} from './session';
import { isValidId } from './todo';

// Thrown when something is asked that the session cannot do right now.
export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

// Builds a session in the prep phase. The input comes from the renderer, so it is checked.
export function createSession(input: unknown): SessionState {
  if (typeof input !== 'object' || input === null) {
    throw new SessionError('Invalid session');
  }
  const { goalId, todoId, config } = input as Record<string, unknown>;

  if (!isValidId(goalId)) {
    throw new SessionError('Invalid goal');
  }
  if (!isValidTodoRef(todoId)) {
    throw new SessionError('Invalid task');
  }
  if (typeof config !== 'object' || config === null) {
    throw new SessionError('Invalid settings');
  }

  const [firstError] = Object.values(checkSessionConfig(config as Record<string, unknown>));
  if (firstError) {
    throw new SessionError(firstError);
  }
  const settings = config as SessionConfig;

  return {
    goalId,
    todoId,
    // Copy only the known settings, so extra fields from the renderer are dropped.
    config: {
      focusMinutes: settings.focusMinutes,
      breakMinutes: settings.breakMinutes,
      longBreakMinutes: settings.longBreakMinutes,
      longBreakEvery: settings.longBreakEvery,
      rounds: settings.rounds,
      strictness: settings.strictness
    },
    phase: 'prep',
    round: 0,
    segmentStartedAt: null,
    elapsedBeforeSegment: 0,
    pausedAt: null,
    pausesUsed: 0,
    focusedMs: 0,
    startedAt: null,
    endedAt: null,
    endReason: null
  };
}

// Leaves prep and starts the first focus round.
export function startSession(state: SessionState, now: number): SessionState {
  if (state.phase !== 'prep') {
    throw new SessionError('The session has already started');
  }
  return {
    ...state,
    phase: 'focus',
    round: 1,
    segmentStartedAt: now,
    elapsedBeforeSegment: 0,
    startedAt: now
  };
}

// Starts the given phase with a fresh clock at the given moment.
function beginPhase(
  state: SessionState,
  phase: 'focus' | 'break',
  round: number,
  at: number
): SessionState {
  return { ...state, phase, round, segmentStartedAt: at, elapsedBeforeSegment: 0 };
}

function endSession(
  state: SessionState,
  reason: 'completed' | 'abandoned',
  focusedMs: number,
  at: number
): SessionState {
  return {
    ...state,
    phase: 'ended',
    segmentStartedAt: null,
    elapsedBeforeSegment: 0,
    pausedAt: null,
    focusedMs,
    endedAt: at,
    endReason: reason
  };
}

// Finishes the running phase at the moment it was due, and moves on to the next one.
function completePhase(state: SessionState, at: number): SessionState {
  if (state.phase === 'break') {
    return beginPhase(state, 'focus', state.round + 1, at);
  }

  const focusedMs = state.focusedMs + phaseDurationMs(state);
  // The last round ends the session at once, with no break after it.
  if (state.round >= state.config.rounds) {
    return endSession(state, 'completed', focusedMs, at);
  }
  return beginPhase({ ...state, focusedMs }, 'break', state.round, at);
}

function resumeAt(state: SessionState, at: number): SessionState {
  return { ...state, pausedAt: null, segmentStartedAt: at };
}

// A pause that has used up its allowed time ends by itself, as of the moment it ran out.
function endExpiredPause(state: SessionState, now: number): SessionState {
  const { maxPauseMinutes } = PAUSE_RULES[state.config.strictness];
  if (state.pausedAt === null || maxPauseMinutes === null) {
    return state;
  }

  const expiresAt = state.pausedAt + maxPauseMinutes * MS_PER_MINUTE;
  return now >= expiresAt ? resumeAt(state, expiresAt) : state;
}

// Brings the state up to date with the clock. Call it on every tick and when the app wakes
// up. It completes every phase that is already due, each at its own scheduled time, so a
// laptop that slept for hours still ends up exactly where the schedule says it should be.
export function advance(state: SessionState, now: number): SessionState {
  let current = endExpiredPause(state, now);

  while (
    (current.phase === 'focus' || current.phase === 'break') &&
    current.segmentStartedAt !== null
  ) {
    const phaseEnd =
      current.segmentStartedAt + phaseDurationMs(current) - current.elapsedBeforeSegment;
    if (phaseEnd > now) {
      break;
    }
    current = completePhase(current, phaseEnd);
  }

  return current;
}

// Stops the clock during a focus round, if the strictness level still allows a pause.
export function pauseSession(state: SessionState, now: number): SessionState {
  const current = advance(state, now);

  if (current.phase !== 'focus') {
    throw new SessionError('Only a focus round can be paused');
  }
  if (current.pausedAt !== null) {
    throw new SessionError('The session is already paused');
  }
  if (pausesLeft(current) === 0) {
    throw new SessionError('No pauses left');
  }

  return {
    ...current,
    elapsedBeforeSegment: elapsedMs(current, now),
    segmentStartedAt: null,
    pausedAt: now,
    pausesUsed: current.pausesUsed + 1
  };
}

export function resumeSession(state: SessionState, now: number): SessionState {
  const current = advance(state, now);

  if (current.pausedAt === null) {
    throw new SessionError('The session is not paused');
  }
  return resumeAt(current, now);
}

// Ends the session early. Focus time already done still counts, including the unfinished
// round, but time spent paused or on a break does not.
export function abandonSession(state: SessionState, now: number): SessionState {
  const current = advance(state, now);

  if (current.phase === 'ended') {
    throw new SessionError('The session has already ended');
  }

  const unfinishedFocus =
    current.phase === 'focus' ? Math.min(elapsedMs(current, now), phaseDurationMs(current)) : 0;
  return endSession(current, 'abandoned', current.focusedMs + unfinishedFocus, now);
}
