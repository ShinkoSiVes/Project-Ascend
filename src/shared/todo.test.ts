import { describe, expect, it } from 'vitest';
import { checkTodoFields, isValidId } from './todo';

describe('checkTodoFields', () => {
  it('accepts a title with and without an estimate', () => {
    expect(checkTodoFields({ title: 'Read chapter 3', estimatePomodoros: 2 })).toEqual({});
    expect(checkTodoFields({ title: 'Read chapter 3', estimatePomodoros: null })).toEqual({});
  });

  it('accepts the limits exactly', () => {
    expect(checkTodoFields({ title: 'x'.repeat(200), estimatePomodoros: 1 })).toEqual({});
    expect(checkTodoFields({ title: 'x', estimatePomodoros: 99 })).toEqual({});
  });

  it.each([
    ['a missing title', { title: undefined, estimatePomodoros: null }, 'title'],
    ['a numeric title', { title: 7, estimatePomodoros: null }, 'title'],
    ['a blank title', { title: '   ', estimatePomodoros: null }, 'title'],
    ['a title over 200 characters', { title: 'x'.repeat(201), estimatePomodoros: null }, 'title'],
    ['an estimate of 0', { title: 'ok', estimatePomodoros: 0 }, 'estimatePomodoros'],
    ['an estimate above 99', { title: 'ok', estimatePomodoros: 100 }, 'estimatePomodoros'],
    ['a fractional estimate', { title: 'ok', estimatePomodoros: 1.5 }, 'estimatePomodoros'],
    ['an estimate as text', { title: 'ok', estimatePomodoros: '2' }, 'estimatePomodoros'],
    ['a NaN estimate', { title: 'ok', estimatePomodoros: NaN }, 'estimatePomodoros'],
    ['a missing estimate', { title: 'ok' }, 'estimatePomodoros']
  ])('flags %s', (_name, input, field) => {
    expect(Object.keys(checkTodoFields(input))).toEqual([field]);
  });

  it('reports both fields at once', () => {
    expect(Object.keys(checkTodoFields({ title: '', estimatePomodoros: 0 })).sort()).toEqual([
      'estimatePomodoros',
      'title'
    ]);
  });
});

describe('isValidId', () => {
  it.each([1, 2, 9999])('accepts %s', (value) => {
    expect(isValidId(value)).toBe(true);
  });

  it.each([0, -1, 1.5, NaN, Infinity, '1', null, undefined, {}])('rejects %s', (value) => {
    expect(isValidId(value)).toBe(false);
  });
});
