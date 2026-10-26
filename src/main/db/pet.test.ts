import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { addXp, choosePet, getPetRecord, getPetState, totalXp } from './pet';

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('choosePet and getPetRecord', () => {
  it('has no pet at first', () => {
    expect(getPetRecord(db)).toBeNull();
    expect(getPetState(db)).toBeNull();
  });

  it('saves the chosen starter with a trimmed name', () => {
    const pet = choosePet(db, { species: 'tide', name: '  Bean  ' });

    expect(pet).toMatchObject({ species: 'tide', name: 'Bean' });
    expect(new Date(pet.chosenAt).toString()).not.toBe('Invalid Date');
    expect(getPetRecord(db)).toEqual(pet);
  });

  it('allows only one pet', () => {
    choosePet(db, { species: 'ember', name: 'First' });

    expect(() => choosePet(db, { species: 'leaf', name: 'Second' })).toThrow('already have a pet');
    expect(getPetRecord(db)?.name).toBe('First');
  });

  it.each([
    ['null', null],
    ['text', 'ember'],
    ['an unknown species', { species: 'dragon', name: 'Bean' }],
    ['a missing name', { species: 'ember' }],
    ['a blank name', { species: 'ember', name: '   ' }],
    ['a name over 20 characters', { species: 'ember', name: 'x'.repeat(21) }]
  ])('rejects %s and saves nothing', (_name, input) => {
    expect(() => choosePet(db, input)).toThrow();
    expect(getPetRecord(db)).toBeNull();
  });

  it('keeps the table to a single row even if validation is bypassed', () => {
    const insert = db.prepare('INSERT INTO pets (id, species, name) VALUES (?, ?, ?)');
    insert.run(1, 'ember', 'One');

    expect(() => insert.run(2, 'tide', 'Two')).toThrow();
    expect(() => insert.run(1, 'tide', 'Dup')).toThrow();
  });

  it('rejects bad rows even if validation is bypassed', () => {
    const insert = db.prepare('INSERT INTO pets (id, species, name) VALUES (1, ?, ?)');

    expect(() => insert.run('dragon', 'Bean')).toThrow();
    expect(() => insert.run('ember', '')).toThrow();
  });
});

describe('addXp and totalXp', () => {
  it('starts at zero', () => {
    expect(totalXp(db)).toBe(0);
  });

  it('adds up every payout', () => {
    addXp(db, 'session', 1, 40);
    addXp(db, 'session', 2, 60);
    addXp(db, 'task', 1, 25);

    expect(totalXp(db)).toBe(125);
  });

  it('pays a given session or task only once', () => {
    expect(addXp(db, 'session', 7, 50)).toBe(true);
    expect(addXp(db, 'session', 7, 50)).toBe(false);
    expect(addXp(db, 'session', 7, 999)).toBe(false);
    expect(addXp(db, 'task', 7, 25)).toBe(true);

    expect(totalXp(db)).toBe(75);
  });

  it.each([0, -5, 1.5, NaN])('ignores an amount of %s', (amount) => {
    expect(addXp(db, 'session', 1, amount)).toBe(false);
    expect(totalXp(db)).toBe(0);
  });

  it('rejects an unknown source even if validation is bypassed', () => {
    expect(() =>
      db.prepare("INSERT INTO xp_events (source, ref_id, amount) VALUES ('cheat', 1, 5)").run()
    ).toThrow();
  });
});

describe('getPetState', () => {
  it('combines the pet with all the XP earned, even XP earned before it was chosen', () => {
    addXp(db, 'session', 1, 310);

    choosePet(db, { species: 'leaf', name: 'Fern' });

    expect(getPetState(db)).toMatchObject({
      species: 'leaf',
      name: 'Fern',
      xp: 310,
      stage: 2,
      xpIntoStage: 10,
      xpForStage: 900
    });
  });

  it('evolves as XP grows', () => {
    choosePet(db, { species: 'ember', name: 'Bean' });
    expect(getPetState(db)?.stage).toBe(1);

    addXp(db, 'session', 1, 300);
    expect(getPetState(db)?.stage).toBe(2);

    addXp(db, 'session', 2, 900);
    expect(getPetState(db)).toMatchObject({ stage: 3, xp: 1200, xpForStage: null });
  });
});
