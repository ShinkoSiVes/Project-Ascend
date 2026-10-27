import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultBlocklist } from '../../shared/distraction';
import { openDatabase } from './database';
import {
  getBlocklist,
  listDistractionCounts,
  recordDistraction,
  setBlocklist
} from './distractions';

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('the blocklist', () => {
  it('is the default list until one is saved', () => {
    expect(getBlocklist(db)).toEqual(defaultBlocklist());
  });

  it('saves a list and reads it back in plain form', () => {
    const saved = setBlocklist(db, ['Discord.exe', 'game', 'DISCORD']);

    expect(saved).toEqual(['discord', 'game']);
    expect(getBlocklist(db)).toEqual(['discord', 'game']);
  });

  it('keeps an empty list, so a person can block nothing', () => {
    setBlocklist(db, []);

    expect(getBlocklist(db)).toEqual([]);
  });

  it('replaces the saved list instead of adding to it', () => {
    setBlocklist(db, ['a', 'b']);
    setBlocklist(db, ['c']);

    expect(getBlocklist(db)).toEqual(['c']);
  });

  it('refuses a bad list and keeps the one that was saved', () => {
    setBlocklist(db, ['keep']);

    expect(() => setBlocklist(db, 'discord')).toThrow('list of app names');
    expect(() => setBlocklist(db, ['ok', 3])).toThrow('must be text');

    expect(getBlocklist(db)).toEqual(['keep']);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['JSON of the wrong type', '"hello"'],
    ['a list with a number in it', '["a", 1]']
  ])('falls back to the default list for %s', (_name, text) => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('blocklist', ?)").run(text);

    expect(getBlocklist(db)).toEqual(defaultBlocklist());
  });
});

describe('distraction counts', () => {
  it('starts empty', () => {
    expect(listDistractionCounts(db)).toEqual([]);
  });

  it('counts each app on its own, most frequent first', () => {
    recordDistraction(db, 'steam');
    recordDistraction(db, 'discord');
    recordDistraction(db, 'discord');
    recordDistraction(db, 'discord');
    recordDistraction(db, 'steam');
    recordDistraction(db, 'tiktok');

    expect(listDistractionCounts(db)).toEqual([
      { app: 'discord', count: 3 },
      { app: 'steam', count: 2 },
      { app: 'tiktok', count: 1 }
    ]);
  });

  it('puts apps with the same count in name order', () => {
    recordDistraction(db, 'b');
    recordDistraction(db, 'a');

    expect(listDistractionCounts(db).map((row) => row.app)).toEqual(['a', 'b']);
  });

  it('counts the same app however its name is written', () => {
    recordDistraction(db, 'Discord.exe');
    recordDistraction(db, 'discord');

    expect(listDistractionCounts(db)).toEqual([{ app: 'discord', count: 2 }]);
  });

  it('ignores a blank name and a name that is too long', () => {
    recordDistraction(db, '   ');
    recordDistraction(db, '.exe');
    recordDistraction(db, 'a'.repeat(101));

    expect(listDistractionCounts(db)).toEqual([]);
  });

  it('keeps nothing but names and counts', () => {
    const columns = db.prepare('PRAGMA table_info(distraction_counts)').all() as { name: string }[];

    expect(columns.map((column) => column.name)).toEqual(['app', 'count']);
  });
});
