// Types, rules and read-only helpers for focus sessions (Pomodoro rounds).
// Everything here is plain data and pure functions with no timers, so the main process and
// the renderer can both use it. The transitions live in sessionEngine.ts.

import { STRICTNESS_LEVELS, type Strictness } from './goal';
import { isValidId } from './todo';

export const MS_PER_MINUTE = 60_000;

// Allowed range for each length setting, in whole minutes (or whole rounds).
export const SESSION_LIMITS = {
  focusMinutes: { min: 1, max: 180, label: 'Focus length' },
  breakMinutes: { min: 1, max: 60, label: 'Break length' },
  longBreakMinutes: { min: 1, max: 120, label: 'Long break length' },
  longBreakEvery: { min: 2, max: 12, label: 'Rounds per long break' },
  rounds: { min: 1, max: 12, label: 'Rounds' }
} as const;

export interface SessionConfig {
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  // A long break replaces the short one after every Nth round.
  longBreakEvery: number;
  rounds: number;
  strictness: Strictness;
}

// The classic Pomodoro: 25 minutes of focus, 5 off, and a 15 minute break every 4th round.
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  focusMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  rounds: 4,
  strictness: 'medium'
};

// How much pausing each strictness level allows. null means no limit.
export const PAUSE_RULES: Record<
  Strictness,
  { maxPauses: number | null; maxPauseMinutes: number | null }
> = {
  gentle: { maxPauses: null, maxPauseMinutes: null },
  medium: { maxPauses: 2, maxPauseMinutes: 5 },
  hard: { maxPauses: 0, maxPauseMinutes: 0 }
};

export const PHASES = ['prep', 'focus', 'break', 'ended'] as const;
export type Phase = (typeof PHASES)[number];

export type EndReason = 'completed' | 'abandoned';

export interface SessionState {
  goalId: number;
  // The task being worked on, or null for the goal in general.
  todoId: number | null;
  config: SessionConfig;
  phase: Phase;
  // The current focus round, counting from 1. It is 0 while preparing.
  round: number;
  // When the clock last started running (epoch ms). null while paused, preparing or ended.
  segmentStartedAt: number | null;
  // Time already used in the current phase before the clock last started running.
  elapsedBeforeSegment: number;
  // When the current pause began, or null if the session is not paused.
  pausedAt: number | null;
  pausesUsed: number;
  // When the person stopped touching the keyboard and mouse, if they are away right now. The clock
  // is stopped from that moment, like a pause, but it does not use up one of the allowed pauses.
  awaySince: number | null;
  // Time spent away in this session, not counting the current stretch.
  awayMs: number;
  // Focus time from finished rounds. Use focusedMsSoFar() to include the running round.
  focusedMs: number;
  startedAt: number | null;
  endedAt: number | null;
  endReason: EndReason | null;
}

export type SessionConfigErrors = Partial<Record<keyof SessionConfig, string>>;

// Checks every setting and returns a message per invalid field.
// An empty object means the configuration is valid.
export function checkSessionConfig(input: Record<string, unknown>): SessionConfigErrors {
  const errors: SessionConfigErrors = {};

  for (const key of Object.keys(SESSION_LIMITS) as (keyof typeof SESSION_LIMITS)[]) {
    const { min, max, label } = SESSION_LIMITS[key];
    const value = input[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      errors[key] = `${label} must be a whole number from ${min} to ${max}`;
    }
  }

  const { strictness } = input;
  if (typeof strictness !== 'string' || !STRICTNESS_LEVELS.includes(strictness as Strictness)) {
    errors.strictness = `Strictness must be one of: ${STRICTNESS_LEVELS.join(', ')}`;
  }

  return errors;
}

// What a person sets in the prep phase: which goal, which task, and the timings.
export interface NewSession {
  goalId: number;
  todoId: number | null;
  config: SessionConfig;
}

export function isValidTodoRef(value: unknown): value is number | null {
  return value === null || isValidId(value);
}

// True when the break after this round is the long one. The last round has no break at all.
export function isLongBreak(config: SessionConfig, round: number): boolean {
  return round % config.longBreakEvery === 0;
}

// How long the current phase lasts in total. Preparing and ended phases have no clock.
export function phaseDurationMs(state: SessionState): number {
  const { config } = state;

  if (state.phase === 'focus') {
    return config.focusMinutes * MS_PER_MINUTE;
  }
  if (state.phase === 'break') {
    const minutes = isLongBreak(config, state.round)
      ? config.longBreakMinutes
      : config.breakMinutes;
    return minutes * MS_PER_MINUTE;
  }
  return 0;
}

// How much of the current phase has been used. Time never counts backwards, even if the
// system clock does.
export function elapsedMs(state: SessionState, now: number): number {
  if (state.segmentStartedAt === null) {
    return state.elapsedBeforeSegment;
  }
  return state.elapsedBeforeSegment + Math.max(0, now - state.segmentStartedAt);
}

export function remainingMs(state: SessionState, now: number): number {
  return Math.max(0, phaseDurationMs(state) - elapsedMs(state, now));
}

// Total focus time, including the round in progress.
export function focusedMsSoFar(state: SessionState, now: number): number {
  if (state.phase !== 'focus') {
    return state.focusedMs;
  }
  return state.focusedMs + Math.min(elapsedMs(state, now), phaseDurationMs(state));
}

export function isPaused(state: SessionState): boolean {
  return state.pausedAt !== null;
}

// Whether the clock is stopped because nobody has touched the keyboard or mouse for a while.
export function isAway(state: SessionState): boolean {
  return state.awaySince !== null;
}

// Total time away so far, including the stretch that is still going on.
export function awayMsSoFar(state: SessionState, now: number): number {
  const current = state.awaySince === null ? 0 : Math.max(0, now - state.awaySince);
  return state.awayMs + current;
}

// After this many seconds without input, the person counts as away and the focus clock stops.
export const AWAY_AFTER_SECONDS = 300;
export const MIN_AWAY_AFTER_SECONDS = 30;
export const MAX_AWAY_AFTER_SECONDS = 1800;

// How many more pauses are allowed, or null for no limit.
export function pausesLeft(state: SessionState): number | null {
  const { maxPauses } = PAUSE_RULES[state.config.strictness];
  return maxPauses === null ? null : Math.max(0, maxPauses - state.pausesUsed);
}
