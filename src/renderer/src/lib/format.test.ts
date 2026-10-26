import { describe, expect, it } from 'vitest';
import { formatClock, formatFocused } from './format';

describe('formatClock', () => {
  it.each([
    [25 * 60_000, '25:00'],
    [5 * 60_000, '05:00'],
    [61_000, '01:01'],
    [60_000, '01:00'],
    [59_000, '00:59'],
    [1_000, '00:01'],
    [0, '00:00'],
    [3_600_000, '1:00:00'],
    [3_661_000, '1:01:01'],
    [180 * 60_000, '3:00:00']
  ])('shows %i ms as %s', (ms, expected) => {
    expect(formatClock(ms)).toBe(expected);
  });

  it('rounds a started second up, so the clock reads 00:01 until the last moment', () => {
    expect(formatClock(1)).toBe('00:01');
    expect(formatClock(999)).toBe('00:01');
    expect(formatClock(1_001)).toBe('00:02');
    expect(formatClock(24 * 60_000 + 59_001)).toBe('25:00');
  });

  it('never shows a negative time', () => {
    expect(formatClock(-5_000)).toBe('00:00');
  });
});

describe('formatFocused', () => {
  it.each([
    [0, '0 s'],
    [45_000, '45 s'],
    [60_000, '1 min'],
    [90_000, '1 min 30 s'],
    [12 * 60_000 + 30_000, '12 min 30 s'],
    [59 * 60_000 + 59_000, '59 min 59 s'],
    [3_600_000, '1 h 0 min'],
    [65 * 60_000, '1 h 5 min'],
    [200 * 60_000, '3 h 20 min']
  ])('describes %i ms as %s', (ms, expected) => {
    expect(formatFocused(ms)).toBe(expected);
  });

  it('drops the fraction of a second and never goes negative', () => {
    expect(formatFocused(1_999)).toBe('1 s');
    expect(formatFocused(-1)).toBe('0 s');
  });
});
