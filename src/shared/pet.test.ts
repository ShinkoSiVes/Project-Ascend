import { describe, expect, it } from 'vitest';
import {
  EVOLUTION_XP,
  FINAL_STAGE,
  MAX_PET_NAME_LENGTH,
  SPECIES,
  SPECIES_IDS,
  checkPetChoice,
  petStateFrom,
  sessionXp,
  stageForXp,
  stageName,
  type PetRecord
} from './pet';

const MIN = 60_000;
const record: PetRecord = { species: 'ember', name: 'Bean', chosenAt: '2026-10-27T00:00:00.000Z' };

describe('species data', () => {
  it('has three starters, each with three distinct stage names', () => {
    expect(SPECIES_IDS).toEqual(['ember', 'tide', 'leaf']);

    const allNames = SPECIES_IDS.flatMap((id) => [...SPECIES[id].stageNames]);
    expect(allNames).toHaveLength(9);
    expect(new Set(allNames).size).toBe(9);
    expect(allNames.every((name) => name.length > 0)).toBe(true);
  });

  it('keys every species by its own id', () => {
    for (const id of SPECIES_IDS) {
      expect(SPECIES[id].id).toBe(id);
      expect(SPECIES[id].blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('stageForXp', () => {
  it.each([
    [0, 1],
    [1, 1],
    [299, 1],
    [300, 2],
    [301, 2],
    [1199, 2],
    [1200, 3],
    [1_000_000, 3]
  ])('puts %i XP at stage %i', (xp, stage) => {
    expect(stageForXp(xp)).toBe(stage);
  });

  it('never goes below the first stage', () => {
    expect(stageForXp(-50)).toBe(1);
  });

  it('matches the thresholds in EVOLUTION_XP', () => {
    expect(EVOLUTION_XP).toEqual([0, 300, 1200]);
    expect(FINAL_STAGE).toBe(3);
  });
});

describe('stageName', () => {
  it('returns the name for each stage', () => {
    expect(stageName('ember', 1)).toBe('Sparkit');
    expect(stageName('ember', 2)).toBe('Cindrel');
    expect(stageName('ember', 3)).toBe('Pyrovane');
    expect(stageName('tide', 2)).toBe('Wavelet');
    expect(stageName('leaf', 3)).toBe('Verdantus');
  });

  it('stays inside the stages for out-of-range input', () => {
    expect(stageName('ember', 0)).toBe('Sparkit');
    expect(stageName('ember', 99)).toBe('Pyrovane');
  });
});

describe('petStateFrom', () => {
  it('shows progress inside the first stage', () => {
    expect(petStateFrom(record, 120)).toMatchObject({
      stage: 1,
      xp: 120,
      xpIntoStage: 120,
      xpForStage: 300
    });
  });

  it('starts the next stage from zero progress when it evolves', () => {
    expect(petStateFrom(record, 300)).toMatchObject({
      stage: 2,
      xpIntoStage: 0,
      xpForStage: 900
    });
  });

  it('shows progress inside the second stage', () => {
    expect(petStateFrom(record, 750)).toMatchObject({
      stage: 2,
      xpIntoStage: 450,
      xpForStage: 900
    });
  });

  it('has no next stage at the final one', () => {
    expect(petStateFrom(record, 1200)).toMatchObject({
      stage: 3,
      xpIntoStage: 0,
      xpForStage: null
    });
    expect(petStateFrom(record, 5000)).toMatchObject({
      stage: 3,
      xpIntoStage: 3800,
      xpForStage: null
    });
  });

  it('keeps the chosen species, name and date', () => {
    expect(petStateFrom(record, 10)).toMatchObject(record);
  });

  it('treats negative or fractional XP safely', () => {
    expect(petStateFrom(record, -5).xp).toBe(0);
    expect(petStateFrom(record, 12.9).xp).toBe(12);
  });
});

describe('sessionXp', () => {
  it('pays one XP per whole focused minute', () => {
    expect(sessionXp(0, false)).toBe(0);
    expect(sessionXp(59_999, false)).toBe(0);
    expect(sessionXp(MIN, false)).toBe(1);
    expect(sessionXp(10 * MIN + 59_000, false)).toBe(10);
  });

  it('adds the bonus for a completed session', () => {
    expect(sessionXp(100 * MIN, true)).toBe(150);
    expect(sessionXp(MIN, true)).toBe(51);
  });

  it('still pays the focused minutes when a session is given up', () => {
    expect(sessionXp(30 * MIN, false)).toBe(30);
  });

  it('never pays a negative amount', () => {
    expect(sessionXp(-5 * MIN, false)).toBe(0);
  });
});

describe('checkPetChoice', () => {
  it('accepts every starter with a valid name', () => {
    for (const species of SPECIES_IDS) {
      expect(checkPetChoice({ species, name: 'Bean' })).toEqual({});
    }
  });

  it('accepts the name length limits', () => {
    expect(checkPetChoice({ species: 'tide', name: 'x' })).toEqual({});
    expect(checkPetChoice({ species: 'tide', name: 'x'.repeat(MAX_PET_NAME_LENGTH) })).toEqual({});
  });

  it.each([
    ['an unknown species', { species: 'dragon', name: 'Bean' }, 'species'],
    ['a missing species', { name: 'Bean' }, 'species'],
    ['a numeric species', { species: 3, name: 'Bean' }, 'species'],
    ['a blank name', { species: 'ember', name: '   ' }, 'name'],
    ['a missing name', { species: 'ember' }, 'name'],
    ['a name that is too long', { species: 'ember', name: 'x'.repeat(21) }, 'name'],
    ['a numeric name', { species: 'ember', name: 7 }, 'name']
  ])('flags %s', (_name, input, field) => {
    expect(Object.keys(checkPetChoice(input))).toEqual([field]);
  });

  it('reports both fields at once', () => {
    expect(Object.keys(checkPetChoice({ species: 'x', name: '' })).sort()).toEqual([
      'name',
      'species'
    ]);
  });
});
