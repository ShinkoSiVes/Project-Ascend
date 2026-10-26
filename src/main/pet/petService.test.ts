import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { addXp, totalXp } from '../db/pet';
import type { PetUpdate } from '../../shared/pet';
import { DEFAULT_SESSION_CONFIG, MS_PER_MINUTE, type SessionState } from '../../shared/session';
import { createSession } from '../../shared/sessionEngine';
import { PetService } from './petService';

const MIN = MS_PER_MINUTE;

let db: DatabaseSync;
let updates: PetUpdate[];
let service: PetService;

// A session that has already ended, with the given focus time and how it ended.
function endedSession(focusedMinutes: number, endReason: 'completed' | 'abandoned'): SessionState {
  const state = createSession({ goalId: 1, todoId: null, config: DEFAULT_SESSION_CONFIG });
  return { ...state, phase: 'ended', focusedMs: focusedMinutes * MIN, endReason };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  updates = [];
  service = new PetService(db, (update) => updates.push(update));
});

describe('choose and get', () => {
  it('has no pet until a starter is chosen', () => {
    expect(service.get()).toBeNull();
  });

  it('returns the pet with its progress once chosen', () => {
    const pet = service.choose({ species: 'ember', name: 'Bean' });

    expect(pet).toMatchObject({ species: 'ember', name: 'Bean', stage: 1, xp: 0, xpForStage: 300 });
    expect(service.get()).toEqual(pet);
  });

  it('refuses a second pet and an invalid choice', () => {
    service.choose({ species: 'ember', name: 'Bean' });

    expect(() => service.choose({ species: 'tide', name: 'Other' })).toThrow('already have a pet');
    expect(() =>
      new PetService(openDatabase(':memory:')).choose({ species: 'x', name: 'y' })
    ).toThrow();
  });
});

describe('awardSession', () => {
  beforeEach(() => {
    service.choose({ species: 'tide', name: 'Drop' });
  });

  it('pays the focused minutes plus the bonus for a completed session', () => {
    expect(service.awardSession(1, endedSession(100, 'completed'))).toBe(150);

    expect(service.get()?.xp).toBe(150);
  });

  it('pays only the focused minutes for an abandoned session', () => {
    expect(service.awardSession(1, endedSession(10, 'abandoned'))).toBe(10);
  });

  it('pays nothing for less than a minute of focus', () => {
    expect(service.awardSession(1, endedSession(0, 'abandoned'))).toBe(0);

    expect(totalXp(db)).toBe(0);
    expect(updates).toEqual([]);
  });

  it('pays a session only once', () => {
    service.awardSession(1, endedSession(25, 'completed'));

    expect(service.awardSession(1, endedSession(25, 'completed'))).toBe(0);
    expect(totalXp(db)).toBe(75);
    expect(updates).toHaveLength(1);
  });

  it('pays different sessions separately', () => {
    service.awardSession(1, endedSession(10, 'abandoned'));
    service.awardSession(2, endedSession(20, 'abandoned'));

    expect(service.get()?.xp).toBe(30);
  });
});

describe('awardTask', () => {
  beforeEach(() => {
    service.choose({ species: 'leaf', name: 'Fern' });
  });

  it('pays 25 XP for finishing a task', () => {
    expect(service.awardTask(4)).toBe(25);

    expect(service.get()?.xp).toBe(25);
  });

  it('pays a task only once, however often it is checked off again', () => {
    service.awardTask(4);

    expect(service.awardTask(4)).toBe(0);
    expect(service.awardTask(4)).toBe(0);
    expect(totalXp(db)).toBe(25);
  });

  it('pays different tasks separately', () => {
    service.awardTask(1);
    service.awardTask(2);

    expect(service.get()?.xp).toBe(50);
  });
});

describe('telling the window', () => {
  it('sends the new state, the amount gained and no evolution within a stage', () => {
    service.choose({ species: 'ember', name: 'Bean' });

    service.awardTask(1);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      gained: 25,
      evolved: false,
      pet: { xp: 25, stage: 1, xpIntoStage: 25 }
    });
  });

  it('says so exactly when XP crosses an evolution threshold', () => {
    service.choose({ species: 'ember', name: 'Bean' });
    addXp(db, 'session', 100, 290);

    service.awardTask(1);
    expect(updates[0]).toMatchObject({ evolved: true, pet: { xp: 315, stage: 2 } });

    service.awardTask(2);
    expect(updates[1]).toMatchObject({ evolved: false, pet: { xp: 340, stage: 2 } });
  });

  it('says so when a single payout lands exactly on the threshold', () => {
    service.choose({ species: 'ember', name: 'Bean' });
    addXp(db, 'session', 100, 275);

    service.awardTask(1);

    expect(updates[0]).toMatchObject({ evolved: true, pet: { xp: 300, stage: 2, xpIntoStage: 0 } });
  });

  it('reports each evolution once on the way to the final stage', () => {
    service.choose({ species: 'ember', name: 'Bean' });

    service.awardSession(1, endedSession(180, 'completed'));
    service.awardSession(2, endedSession(180, 'completed'));
    service.awardSession(3, endedSession(180, 'completed'));
    service.awardSession(4, endedSession(180, 'completed'));
    service.awardSession(5, endedSession(180, 'completed'));
    service.awardSession(6, endedSession(180, 'completed'));

    expect(service.get()).toMatchObject({ stage: 3, xpForStage: null });
    expect(updates.filter((update) => update.evolved)).toHaveLength(2);
  });

  it('stays quiet before a starter is chosen, but keeps the XP for later', () => {
    service.awardTask(1);
    service.awardSession(1, endedSession(40, 'completed'));
    expect(updates).toEqual([]);

    const pet = service.choose({ species: 'leaf', name: 'Fern' });

    expect(pet.xp).toBe(115);
  });
});
