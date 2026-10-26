import { describe, expect, it } from 'vitest';
import { checkGoal } from './goal';

const validGoal = {
  title: 'Finish the thesis',
  targetHours: 20,
  difficulty: 3,
  strictness: 'medium'
};

describe('checkGoal', () => {
  it('returns no errors for a valid goal', () => {
    expect(checkGoal(validGoal)).toEqual({});
  });

  it('accepts the limits exactly', () => {
    expect(checkGoal({ ...validGoal, targetHours: 0.5, difficulty: 1 })).toEqual({});
    expect(checkGoal({ ...validGoal, targetHours: 1000, difficulty: 5 })).toEqual({});
    expect(checkGoal({ ...validGoal, title: 'x'.repeat(100) })).toEqual({});
  });

  it.each([
    ['a missing title', { ...validGoal, title: undefined }, 'title'],
    ['a numeric title', { ...validGoal, title: 5 }, 'title'],
    ['a blank title', { ...validGoal, title: '   ' }, 'title'],
    ['a title over 100 characters', { ...validGoal, title: 'x'.repeat(101) }, 'title'],
    ['hours as text', { ...validGoal, targetHours: '20' }, 'targetHours'],
    ['NaN hours', { ...validGoal, targetHours: NaN }, 'targetHours'],
    ['hours below the minimum', { ...validGoal, targetHours: 0.4 }, 'targetHours'],
    ['hours above the maximum', { ...validGoal, targetHours: 1001 }, 'targetHours'],
    ['difficulty below 1', { ...validGoal, difficulty: 0 }, 'difficulty'],
    ['difficulty above 5', { ...validGoal, difficulty: 6 }, 'difficulty'],
    ['a fractional difficulty', { ...validGoal, difficulty: 2.5 }, 'difficulty'],
    ['an unknown strictness', { ...validGoal, strictness: 'extreme' }, 'strictness']
  ])('flags %s', (_name, input, field) => {
    expect(Object.keys(checkGoal(input))).toEqual([field]);
  });

  it('reports every invalid field at once', () => {
    const errors = checkGoal({ title: '', targetHours: 0, difficulty: 9, strictness: 'x' });

    expect(Object.keys(errors).sort()).toEqual([
      'difficulty',
      'strictness',
      'targetHours',
      'title'
    ]);
  });
});
