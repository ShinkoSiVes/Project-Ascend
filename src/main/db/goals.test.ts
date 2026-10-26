import { describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { createGoal, listGoals, parseNewGoal } from './goals';

const validGoal = {
  title: 'Finish the thesis',
  targetHours: 20,
  difficulty: 3,
  strictness: 'medium'
};

describe('createGoal and listGoals', () => {
  it('saves a goal and returns it with an id and a timestamp', () => {
    const db = openDatabase(':memory:');
    const goal = createGoal(db, validGoal);

    expect(goal).toMatchObject(validGoal);
    expect(goal.id).toBeGreaterThan(0);
    expect(new Date(goal.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('trims the title before saving', () => {
    const db = openDatabase(':memory:');
    const goal = createGoal(db, { ...validGoal, title: '  Read a book  ' });

    expect(goal.title).toBe('Read a book');
  });

  it('lists goals newest first', () => {
    const db = openDatabase(':memory:');
    createGoal(db, { ...validGoal, title: 'first' });
    createGoal(db, { ...validGoal, title: 'second' });

    expect(listGoals(db).map((goal) => goal.title)).toEqual(['second', 'first']);
  });

  it('returns an empty list when there are no goals', () => {
    expect(listGoals(openDatabase(':memory:'))).toEqual([]);
  });

  it('does not save anything when validation fails', () => {
    const db = openDatabase(':memory:');

    expect(() => createGoal(db, { ...validGoal, title: '' })).toThrow();
    expect(listGoals(db)).toEqual([]);
  });
});

describe('parseNewGoal', () => {
  it.each([
    ['null', null],
    ['a string', 'goal'],
    ['a missing title', { ...validGoal, title: undefined }],
    ['a numeric title', { ...validGoal, title: 5 }],
    ['an empty title', { ...validGoal, title: '' }],
    ['a blank title', { ...validGoal, title: '   ' }],
    ['a title over 100 characters', { ...validGoal, title: 'x'.repeat(101) }],
    ['hours as text', { ...validGoal, targetHours: '20' }],
    ['NaN hours', { ...validGoal, targetHours: NaN }],
    ['Infinity hours', { ...validGoal, targetHours: Infinity }],
    ['hours below the minimum', { ...validGoal, targetHours: 0 }],
    ['hours above the maximum', { ...validGoal, targetHours: 1001 }],
    ['difficulty below 1', { ...validGoal, difficulty: 0 }],
    ['difficulty above 5', { ...validGoal, difficulty: 6 }],
    ['a fractional difficulty', { ...validGoal, difficulty: 2.5 }],
    ['an unknown strictness', { ...validGoal, strictness: 'extreme' }],
    ['a missing strictness', { ...validGoal, strictness: undefined }]
  ])('rejects %s', (_name, input) => {
    expect(() => parseNewGoal(input)).toThrow();
  });

  it('accepts the limits exactly', () => {
    expect(parseNewGoal({ ...validGoal, targetHours: 0.5, difficulty: 1 })).toBeTruthy();
    expect(parseNewGoal({ ...validGoal, targetHours: 1000, difficulty: 5 })).toBeTruthy();
    expect(parseNewGoal({ ...validGoal, title: 'x'.repeat(100) })).toBeTruthy();
  });
});

describe('database constraints', () => {
  it('rejects bad rows even if validation is bypassed', () => {
    const db = openDatabase(':memory:');
    const insert = db.prepare(
      'INSERT INTO goals (title, target_hours, difficulty, strictness) VALUES (?, ?, ?, ?)'
    );

    expect(() => insert.run('ok', 1, 1, 'extreme')).toThrow();
    expect(() => insert.run('ok', 1, 9, 'gentle')).toThrow();
    expect(() => insert.run('', 1, 1, 'gentle')).toThrow();
    expect(() => insert.run('ok', 0, 1, 'gentle')).toThrow();
  });
});
