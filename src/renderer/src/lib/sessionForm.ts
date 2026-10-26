import {
  DEFAULT_SESSION_CONFIG,
  checkSessionConfig,
  type SessionConfig,
  type SessionConfigErrors
} from '../../../shared/session';
import type { Strictness } from '../../../shared/goal';

// The five length settings, as the text a person typed.
export type SessionNumberKey =
  'focusMinutes' | 'breakMinutes' | 'longBreakMinutes' | 'longBreakEvery' | 'rounds';
export type SessionFormNumbers = Record<SessionNumberKey, string>;

export const SESSION_NUMBER_KEYS: SessionNumberKey[] = [
  'focusMinutes',
  'breakMinutes',
  'longBreakMinutes',
  'longBreakEvery',
  'rounds'
];

// The form starts with the classic Pomodoro lengths.
export function defaultFormNumbers(): SessionFormNumbers {
  return {
    focusMinutes: String(DEFAULT_SESSION_CONFIG.focusMinutes),
    breakMinutes: String(DEFAULT_SESSION_CONFIG.breakMinutes),
    longBreakMinutes: String(DEFAULT_SESSION_CONFIG.longBreakMinutes),
    longBreakEvery: String(DEFAULT_SESSION_CONFIG.longBreakEvery),
    rounds: String(DEFAULT_SESSION_CONFIG.rounds)
  };
}

// Turns the typed text into a session configuration and checks it with the shared rules.
// An empty box is not a number, so it is reported like any other bad value.
export function buildSessionConfig(
  numbers: SessionFormNumbers,
  strictness: Strictness
): { config: SessionConfig; errors: SessionConfigErrors } {
  const toNumber = (text: string): number => (text.trim() === '' ? NaN : Number(text));

  const config: SessionConfig = {
    focusMinutes: toNumber(numbers.focusMinutes),
    breakMinutes: toNumber(numbers.breakMinutes),
    longBreakMinutes: toNumber(numbers.longBreakMinutes),
    longBreakEvery: toNumber(numbers.longBreakEvery),
    rounds: toNumber(numbers.rounds),
    strictness
  };

  return { config, errors: checkSessionConfig({ ...config }) };
}
