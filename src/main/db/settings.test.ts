import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { AWAY_AFTER_SECONDS } from '../../shared/session';
import { openDatabase } from './database';
import {
  getAwayAfterSeconds,
  getNumberSetting,
  setAwayAfterSeconds,
  setNumberSetting
} from './settings';

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('getNumberSetting and setNumberSetting', () => {
  it('gives the fallback until something is saved', () => {
    expect(getNumberSetting(db, 'example', 7, 1, 10)).toBe(7);
  });

  it('saves a value and reads it back', () => {
    setNumberSetting(db, 'example', 4, 1, 10);

    expect(getNumberSetting(db, 'example', 7, 1, 10)).toBe(4);
  });

  it('replaces a value that was saved before', () => {
    setNumberSetting(db, 'example', 4, 1, 10);
    setNumberSetting(db, 'example', 9, 1, 10);

    expect(getNumberSetting(db, 'example', 7, 1, 10)).toBe(9);
    expect((db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }).n).toBe(1);
  });

  it('accepts the limits exactly', () => {
    expect(() => setNumberSetting(db, 'example', 1, 1, 10)).not.toThrow();
    expect(() => setNumberSetting(db, 'example', 10, 1, 10)).not.toThrow();
  });

  it.each([0, 11, -3, NaN, Infinity])('refuses %s and saves nothing', (value) => {
    expect(() => setNumberSetting(db, 'example', value, 1, 10)).toThrow('from 1 to 10');
    expect(getNumberSetting(db, 'example', 7, 1, 10)).toBe(7);
  });

  it('ignores a saved value that is damaged or out of range', () => {
    const save = (value: string): void => {
      db.prepare(
        "INSERT INTO settings (key, value) VALUES ('example', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"
      ).run(value);
    };

    save('not a number');
    expect(getNumberSetting(db, 'example', 7, 1, 10)).toBe(7);
    save('99');
    expect(getNumberSetting(db, 'example', 7, 1, 10)).toBe(7);
    save('5');
    expect(getNumberSetting(db, 'example', 7, 1, 10)).toBe(5);
  });
});

describe('the away setting', () => {
  it('is five minutes until it is changed', () => {
    expect(getAwayAfterSeconds(db)).toBe(AWAY_AFTER_SECONDS);
    expect(AWAY_AFTER_SECONDS).toBe(300);
  });

  it('can be changed within 30 seconds to 30 minutes', () => {
    setAwayAfterSeconds(db, 30);
    expect(getAwayAfterSeconds(db)).toBe(30);
    setAwayAfterSeconds(db, 1800);
    expect(getAwayAfterSeconds(db)).toBe(1800);
  });

  it('refuses a value outside that range', () => {
    expect(() => setAwayAfterSeconds(db, 29)).toThrow();
    expect(() => setAwayAfterSeconds(db, 1801)).toThrow();
    expect(getAwayAfterSeconds(db)).toBe(AWAY_AFTER_SECONDS);
  });
});
