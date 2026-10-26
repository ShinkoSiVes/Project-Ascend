import { describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_CONFIG } from '../../../shared/session';
import { buildSessionConfig, defaultFormNumbers } from './sessionForm';

describe('defaultFormNumbers', () => {
  it('starts from the classic Pomodoro lengths, as text', () => {
    expect(defaultFormNumbers()).toEqual({
      focusMinutes: '25',
      breakMinutes: '5',
      longBreakMinutes: '15',
      longBreakEvery: '4',
      rounds: '4'
    });
  });
});

describe('buildSessionConfig', () => {
  it('turns the default text into the default configuration', () => {
    const { config, errors } = buildSessionConfig(defaultFormNumbers(), 'medium');

    expect(errors).toEqual({});
    expect(config).toEqual(DEFAULT_SESSION_CONFIG);
  });

  it('uses the chosen strictness', () => {
    expect(buildSessionConfig(defaultFormNumbers(), 'hard').config.strictness).toBe('hard');
  });

  it('accepts custom lengths', () => {
    const numbers = {
      ...defaultFormNumbers(),
      focusMinutes: '50',
      breakMinutes: '10',
      rounds: '3'
    };

    const { config, errors } = buildSessionConfig(numbers, 'gentle');

    expect(errors).toEqual({});
    expect(config).toMatchObject({ focusMinutes: 50, breakMinutes: 10, rounds: 3 });
  });

  it.each([
    ['an empty box', 'focusMinutes', ''],
    ['spaces only', 'breakMinutes', '   '],
    ['text', 'rounds', 'four'],
    ['a decimal', 'focusMinutes', '25.5'],
    ['zero', 'rounds', '0'],
    ['too many minutes', 'focusMinutes', '181'],
    ['a long break interval of 1', 'longBreakEvery', '1']
  ])('flags %s in %s', (_name, key, text) => {
    const numbers = { ...defaultFormNumbers(), [key]: text };

    const { errors } = buildSessionConfig(numbers, 'medium');

    expect(Object.keys(errors)).toEqual([key]);
  });

  it('reports every bad box at once', () => {
    const numbers = {
      focusMinutes: '',
      breakMinutes: '0',
      longBreakMinutes: 'x',
      longBreakEvery: '99',
      rounds: '-1'
    };

    expect(Object.keys(buildSessionConfig(numbers, 'medium').errors).sort()).toEqual([
      'breakMinutes',
      'focusMinutes',
      'longBreakEvery',
      'longBreakMinutes',
      'rounds'
    ]);
  });
});
