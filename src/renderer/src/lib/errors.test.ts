import { describe, expect, it } from 'vitest';
import { friendlyError } from './errors';

const FALLBACK = 'Something went wrong. Please try again.';

describe('friendlyError', () => {
  it('keeps only the message from an Electron IPC error', () => {
    const error = new Error(
      "Error invoking remote method 'session:create': SessionError: A session is already running"
    );

    expect(friendlyError(error)).toBe('A session is already running');
  });

  it('handles a plain Error wrapper', () => {
    const error = new Error("Error invoking remote method 'goals:create': Error: Invalid goal");

    expect(friendlyError(error)).toBe('Invalid goal');
  });

  it('leaves an ordinary message alone', () => {
    expect(friendlyError(new Error('Goal not found'))).toBe('Goal not found');
  });

  it('keeps colons that belong to the message', () => {
    const error = new Error(
      "Error invoking remote method 'x': Error: Strictness must be one of: gentle"
    );

    expect(friendlyError(error)).toBe('Strictness must be one of: gentle');
  });

  it.each([
    ['a string', 'boom'],
    ['null', null],
    ['undefined', undefined],
    ['an object', { message: 'nope' }]
  ])('falls back for %s', (_name, value) => {
    expect(friendlyError(value)).toBe(FALLBACK);
  });

  it('falls back when nothing is left of the message', () => {
    expect(friendlyError(new Error("Error invoking remote method 'x': Error: "))).toBe(FALLBACK);
    expect(friendlyError(new Error(''))).toBe(FALLBACK);
  });
});
