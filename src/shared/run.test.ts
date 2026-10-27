import { describe, expect, it } from 'vitest';
import {
  BASE_QUOTA_MINUTES,
  BOSS_EVERY,
  MAX_STAGES,
  MIN_STAGES,
  PERKS,
  PERKS_OFFERED,
  PERK_IDS,
  REST_SPACING,
  addDays,
  checkRunInput,
  currentStage,
  dayKey,
  daysBetween,
  generateStages,
  isValidSeed,
  mulberry32,
  offerPerks,
  randomSeed,
  remainingQuotaMs,
  roundUpQuota,
  stageCount,
  stageDay,
  stageReached,
  stagesCleared,
  xpMultiplier,
  type RunState
} from './run';

describe('mulberry32', () => {
  it('gives the same numbers for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);

    expect([a(), a(), a(), a()]).toEqual([b(), b(), b(), b()]);
  });

  it('gives different numbers for different seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('stays from 0 up to but not including 1', () => {
    const random = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is spread out, not stuck on one side', () => {
    const random = mulberry32(99);
    let below = 0;
    for (let i = 0; i < 2000; i++) {
      if (random() < 0.5) below++;
    }

    expect(below).toBeGreaterThan(900);
    expect(below).toBeLessThan(1100);
  });
});

describe('randomSeed and isValidSeed', () => {
  it('makes a whole number from 0 to 2^32 - 1', () => {
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.5)).toBe(2147483648);
    expect(randomSeed(() => 0.999999999)).toBeLessThan(4294967296);
    expect(isValidSeed(randomSeed())).toBe(true);
  });

  it.each([0, 1, 4294967295])('accepts %s', (seed) => {
    expect(isValidSeed(seed)).toBe(true);
  });

  it.each([-1, 1.5, 4294967296, NaN, '5', null, undefined])('rejects %s', (seed) => {
    expect(isValidSeed(seed)).toBe(false);
  });
});

describe('calendar days', () => {
  it('names a local day', () => {
    expect(dayKey(new Date(2026, 9, 27, 0, 0, 1).getTime())).toBe('2026-10-27');
    expect(dayKey(new Date(2026, 9, 27, 23, 59, 59).getTime())).toBe('2026-10-27');
    expect(dayKey(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05');
  });

  it('adds and subtracts days across months and years', () => {
    expect(addDays('2026-10-27', 0)).toBe('2026-10-27');
    expect(addDays('2026-10-27', 1)).toBe('2026-10-28');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-10-27', 40)).toBe('2026-12-06');
  });

  it('counts the days between two days', () => {
    expect(daysBetween('2026-10-27', '2026-10-27')).toBe(0);
    expect(daysBetween('2026-10-27', '2026-10-30')).toBe(3);
    expect(daysBetween('2026-10-30', '2026-10-27')).toBe(-3);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('is not thrown off by daylight saving changes', () => {
    // Late March and late October are when most clocks change.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('orders as text, so days can be compared directly', () => {
    expect('2026-10-27' < '2026-10-28').toBe(true);
    expect('2026-12-31' < '2027-01-01').toBe(true);
    expect('2026-02-09' < '2026-02-10').toBe(true);
  });
});

describe('roundUpQuota', () => {
  it.each([
    [1, 5],
    [5, 5],
    [5.1, 10],
    [21, 25],
    [67.5, 70],
    [90, 90],
    [0, 5]
  ])('rounds %s minutes up to %i', (minutes, expected) => {
    expect(roundUpQuota(minutes)).toBe(expected);
  });
});

describe('stageCount', () => {
  it.each([
    // 10 hours at 30 min a day (37.5 average) is 16 days.
    [10, 2, 16],
    [10, 5, 6],
    [10, 1, 24],
    [1, 5, MIN_STAGES],
    [0.5, 3, MIN_STAGES],
    [1000, 1, MAX_STAGES],
    [100, 3, 30]
  ])('gives %s hours at difficulty %s %i stages', (hours, difficulty, expected) => {
    expect(stageCount(hours, difficulty)).toBe(expected);
  });

  it('never leaves the allowed range', () => {
    for (const difficulty of [1, 2, 3, 4, 5]) {
      for (const hours of [0.5, 1, 5, 20, 100, 1000]) {
        const count = stageCount(hours, difficulty);
        expect(count).toBeGreaterThanOrEqual(MIN_STAGES);
        expect(count).toBeLessThanOrEqual(MAX_STAGES);
      }
    }
  });
});

describe('generateStages', () => {
  const plan = { seed: 12345, targetHours: 10, difficulty: 2 };

  it('always builds the same stages from the same plan', () => {
    expect(generateStages(plan)).toEqual(generateStages({ ...plan }));
  });

  it('builds the number of stages stageCount says, numbered from 1', () => {
    const stages = generateStages(plan);

    expect(stages).toHaveLength(stageCount(10, 2));
    expect(stages.map((stage) => stage.index)).toEqual(stages.map((_, i) => i + 1));
  });

  it('makes different maps for different seeds', () => {
    const maps = new Set(
      Array.from({ length: 40 }, (_, seed) => JSON.stringify(generateStages({ ...plan, seed })))
    );

    expect(maps.size).toBeGreaterThan(10);
  });

  it('starts at the base quota for the difficulty and ends higher', () => {
    for (const difficulty of [1, 2, 3, 4, 5]) {
      const stages = generateStages({ seed: 1, targetHours: 50, difficulty });

      expect(stages[0].quotaMinutes).toBe(BASE_QUOTA_MINUTES[difficulty - 1]);
      expect(stages[stages.length - 1].quotaMinutes).toBeGreaterThan(stages[0].quotaMinutes);
    }
  });

  it('rounds every quota to 5 minutes and never goes below 5', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const stage of generateStages({ seed, targetHours: 40, difficulty: 3 })) {
        expect(stage.quotaMinutes % 5).toBe(0);
        expect(stage.quotaMinutes).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('never lowers the quota from one normal stage to the next', () => {
    for (let seed = 0; seed < 50; seed++) {
      const normals = generateStages({ seed, targetHours: 40, difficulty: 4 }).filter(
        (stage) => stage.kind === 'normal'
      );
      for (let i = 1; i < normals.length; i++) {
        expect(normals[i].quotaMinutes).toBeGreaterThanOrEqual(normals[i - 1].quotaMinutes);
      }
    }
  });

  it('makes every 5th stage and the last one a boss, and no others', () => {
    for (let seed = 0; seed < 50; seed++) {
      const stages = generateStages({ seed, targetHours: 40, difficulty: 3 });
      for (const stage of stages) {
        const shouldBeBoss = stage.index % BOSS_EVERY === 0 || stage.index === stages.length;
        expect(stage.kind === 'boss').toBe(shouldBeBoss);
      }
    }
  });

  it('asks more of a boss than of the days around it', () => {
    const stages = generateStages({ seed: 3, targetHours: 40, difficulty: 3 });
    const boss = stages.find((stage) => stage.kind === 'boss' && stage.index > 1)!;
    const before = stages[boss.index - 2];

    expect(boss.quotaMinutes).toBeGreaterThan(before.quotaMinutes);
  });

  it('keeps rest days to the rules', () => {
    let restDays = 0;
    for (let seed = 0; seed < 200; seed++) {
      const stages = generateStages({ seed, targetHours: 60, difficulty: 3 });
      const rests = stages.filter((stage) => stage.kind === 'rest');
      restDays += rests.length;

      for (const rest of rests) {
        expect(rest.index).toBeGreaterThan(1);
        expect(rest.index % BOSS_EVERY).not.toBe(0);
        expect(rest.index).not.toBe(stages.length);
      }
      for (let i = 1; i < rests.length; i++) {
        expect(rests[i].index - rests[i - 1].index).toBeGreaterThanOrEqual(REST_SPACING);
      }
    }
    // Over 200 maps the rest days do appear, so the rule is not simply never firing.
    expect(restDays).toBeGreaterThan(50);
  });

  it('makes a rest day lighter than a normal day at the same point', () => {
    for (let seed = 0; seed < 100; seed++) {
      const stages = generateStages({ seed, targetHours: 60, difficulty: 3 });
      for (const rest of stages.filter((stage) => stage.kind === 'rest')) {
        const normal = stages[rest.index - 2];
        expect(rest.quotaMinutes).toBeLessThan(normal.quotaMinutes);
      }
    }
  });

  it('is not shifted by a rest day: later rolls do not depend on earlier outcomes', () => {
    // The kind of stage k depends only on the seed and k, plus the spacing rule. Two plans with
    // the same seed and different lengths agree on their shared early stages' rolls.
    const short = generateStages({ seed: 77, targetHours: 6, difficulty: 3 });
    const long = generateStages({ seed: 77, targetHours: 30, difficulty: 3 });

    for (const stage of short.slice(0, 3)) {
      expect(long[stage.index - 1].kind).toBe(stage.kind);
    }
  });
});

describe('perks', () => {
  it('describes every perk', () => {
    for (const id of PERK_IDS) {
      expect(PERKS[id].name.length).toBeGreaterThan(0);
      expect(PERKS[id].blurb.length).toBeGreaterThan(0);
    }
  });

  it('offers three different, valid perks', () => {
    for (let seed = 0; seed < 100; seed++) {
      const offer = offerPerks(seed, 3, 0);

      expect(offer).toHaveLength(PERKS_OFFERED);
      expect(new Set(offer).size).toBe(PERKS_OFFERED);
      expect(offer.every((perk) => PERK_IDS.includes(perk))).toBe(true);
    }
  });

  it('gives the same offer for the same run, stage and redraw', () => {
    expect(offerPerks(555, 4, 0)).toEqual(offerPerks(555, 4, 0));
    expect(offerPerks(555, 4, 2)).toEqual(offerPerks(555, 4, 2));
  });

  it('varies by seed, stage and redraw', () => {
    const bySeed = new Set(Array.from({ length: 50 }, (_, seed) => offerPerks(seed, 1, 0).join()));
    const byStage = new Set(Array.from({ length: 20 }, (_, i) => offerPerks(9, i + 1, 0).join()));
    const byRedraw = new Set(Array.from({ length: 20 }, (_, i) => offerPerks(9, 2, i).join()));

    expect(bySeed.size).toBeGreaterThan(3);
    expect(byStage.size).toBeGreaterThan(3);
    expect(byRedraw.size).toBeGreaterThan(3);
  });

  it('gives every perk a fair chance of being offered', () => {
    const seen = new Map<string, number>();
    for (let seed = 0; seed < 400; seed++) {
      for (const perk of offerPerks(seed, 2, 0)) {
        seen.set(perk, (seen.get(perk) ?? 0) + 1);
      }
    }

    // Each of 4 perks appears in 3 of every 4 offers, about 300 of 400.
    for (const id of PERK_IDS) {
      expect(seen.get(id)).toBeGreaterThan(250);
      expect(seen.get(id)).toBeLessThan(350);
    }
  });
});

describe('checkRunInput', () => {
  const valid = { goalId: 1, targetHours: 10, difficulty: 3, seed: 5 };

  it('accepts a valid input and the limits', () => {
    expect(checkRunInput(valid)).toEqual({});
    expect(checkRunInput({ ...valid, targetHours: 0.5, difficulty: 1, seed: 0 })).toEqual({});
    expect(checkRunInput({ ...valid, targetHours: 1000, difficulty: 5, seed: 4294967295 })).toEqual(
      {}
    );
  });

  it.each([
    ['a missing goal', { ...valid, goalId: undefined }, 'goalId'],
    ['a goal id of 0', { ...valid, goalId: 0 }, 'goalId'],
    ['hours as text', { ...valid, targetHours: '10' }, 'targetHours'],
    ['hours below the minimum', { ...valid, targetHours: 0.4 }, 'targetHours'],
    ['hours above the maximum', { ...valid, targetHours: 1001 }, 'targetHours'],
    ['a fractional difficulty', { ...valid, difficulty: 2.5 }, 'difficulty'],
    ['difficulty 6', { ...valid, difficulty: 6 }, 'difficulty'],
    ['a negative seed', { ...valid, seed: -1 }, 'seed'],
    ['a seed that is too large', { ...valid, seed: 4294967296 }, 'seed']
  ])('flags %s', (_name, input, field) => {
    expect(Object.keys(checkRunInput(input))).toEqual([field]);
  });
});

describe('run helpers', () => {
  const run: RunState = {
    goalId: 1,
    seed: 1,
    startDay: '2026-10-27',
    stages: generateStages({ seed: 1, targetHours: 10, difficulty: 2 }),
    stageIndex: 3,
    quotaMinutes: 30,
    focusedMs: 12 * 60_000,
    cleared: false,
    results: ['cleared', 'forgiven'],
    status: 'active',
    endDay: null,
    offers: null,
    redraws: 0,
    shields: 0,
    rerolls: 0,
    xpBoostPercent: 50,
    lighterNext: false,
    perks: [],
    hp: 100,
    revivesUsed: 0,
    failReason: null
  };

  it('puts each stage on its own day, one after another', () => {
    expect(stageDay(run, 1)).toBe('2026-10-27');
    expect(stageDay(run, 2)).toBe('2026-10-28');
    expect(stageDay(run, 3)).toBe('2026-10-29');
    expect(stageDay(run, 8)).toBe('2026-11-03');
  });

  it('finds the current stage', () => {
    expect(currentStage(run).index).toBe(3);
  });

  it('says which stage a run reached, whatever happened to it', () => {
    expect(stageReached(run)).toBe(3);
    expect(stageReached({ ...run, status: 'failed' })).toBe(3);
    expect(stageReached({ ...run, stageIndex: 1 })).toBe(1);
  });

  it('says how much focus is still needed, never below zero', () => {
    expect(remainingQuotaMs(run)).toBe(18 * 60_000);
    expect(remainingQuotaMs({ ...run, focusedMs: 99 * 60_000 })).toBe(0);
  });

  it('counts cleared stages, including a cleared current one', () => {
    expect(stagesCleared(run)).toBe(2);
    expect(stagesCleared({ ...run, cleared: true })).toBe(3);
    expect(stagesCleared({ ...run, cleared: true, status: 'failed' })).toBe(2);
  });

  it('applies the XP boost only while the run is active', () => {
    expect(xpMultiplier(run)).toBe(1.5);
    expect(xpMultiplier({ ...run, status: 'failed' })).toBe(1);
    expect(xpMultiplier({ ...run, xpBoostPercent: 0 })).toBe(1);
  });
});
