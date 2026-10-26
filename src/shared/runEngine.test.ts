import { describe, expect, it } from 'vitest';
import {
  LIGHTER_QUOTA_FACTOR,
  PERK_IDS,
  PERKS_OFFERED,
  generateStages,
  offerPerks,
  roundUpQuota,
  stageDay,
  xpMultiplier,
  type PerkId,
  type RunState
} from './run';
import {
  RunError,
  abandonRun,
  advanceRun,
  createRun,
  pickPerk,
  recordFocus,
  rerollOffers
} from './runEngine';
import { MS_PER_MINUTE } from './session';

const MIN = MS_PER_MINUTE;

// A moment `days` after the first day (27 October 2026) at the given hour, in local time.
const d = (days: number, hour = 10): number => new Date(2026, 9, 27 + days, hour, 0, 0).getTime();

const input = { goalId: 1, targetHours: 10, difficulty: 2, seed: 7 };

function fresh(overrides: Partial<typeof input> = {}): RunState {
  return createRun({ ...input, ...overrides }, d(0));
}

// A short run of three stages, to play from start to finish.
function shortRun(): RunState {
  return createRun({ goalId: 1, targetHours: 0.5, difficulty: 1, seed: 11 }, d(0));
}

// Reaches the current stage's quota in one go on the given day.
function clearToday(run: RunState, day: number): RunState {
  return recordFocus(run, run.goalId, run.quotaMinutes * MIN, d(day));
}

function withOffers(run: RunState, offers: PerkId[]): RunState {
  return { ...run, offers };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('createRun', () => {
  it('starts an active run on the first stage, today', () => {
    const run = fresh();

    expect(run).toMatchObject({
      goalId: 1,
      seed: 7,
      startDay: '2026-10-27',
      stageIndex: 1,
      focusedMs: 0,
      cleared: false,
      results: [],
      status: 'active',
      endDay: null,
      offers: null,
      shields: 0,
      rerolls: 0,
      xpBoostPercent: 0,
      lighterNext: false,
      perks: []
    });
    expect(run.quotaMinutes).toBe(run.stages[0].quotaMinutes);
  });

  it('builds the stages from the seed and the quest', () => {
    expect(fresh().stages).toEqual(generateStages({ seed: 7, targetHours: 10, difficulty: 2 }));
    expect(fresh({ seed: 8 }).stages).not.toEqual(fresh().stages);
  });

  it('starts on the day the run is created, even a minute after midnight', () => {
    expect(createRun(input, new Date(2026, 9, 27, 23, 59, 0).getTime()).startDay).toBe(
      '2026-10-27'
    );
    expect(createRun(input, new Date(2026, 9, 28, 0, 1, 0).getTime()).startDay).toBe('2026-10-28');
  });

  it.each([
    ['null', null],
    ['text', 'run'],
    ['a missing goal', { ...input, goalId: undefined }],
    ['hours of 0', { ...input, targetHours: 0 }],
    ['difficulty 9', { ...input, difficulty: 9 }],
    ['a negative seed', { ...input, seed: -5 }]
  ])('rejects %s', (_name, bad) => {
    expect(() => createRun(bad, d(0))).toThrow(RunError);
  });
});

describe('recordFocus', () => {
  it('counts focus time toward the stage without clearing it early', () => {
    const run = recordFocus(fresh(), 1, 10 * MIN, d(0));

    expect(run.focusedMs).toBe(10 * MIN);
    expect(run.cleared).toBe(false);
    expect(run.offers).toBeNull();
  });

  it('adds up several sessions in a day', () => {
    let run = fresh();
    for (let i = 0; i < 3; i++) {
      run = recordFocus(run, 1, 9 * MIN, d(0, 9 + i));
    }

    expect(run.focusedMs).toBe(27 * MIN);
    expect(run.cleared).toBe(false);
  });

  it('clears the stage exactly when the quota is met, and offers perks', () => {
    const run = fresh();
    const almost = recordFocus(run, 1, run.quotaMinutes * MIN - 1, d(0));
    const done = recordFocus(almost, 1, 1, d(0, 11));

    expect(almost.cleared).toBe(false);
    expect(done.cleared).toBe(true);
    expect(done.offers).toEqual(offerPerks(7, 1, 0));
    expect(done.offers).toHaveLength(PERKS_OFFERED);
    expect(done.status).toBe('active');
  });

  it('keeps counting focus after the stage is cleared, without a second offer', () => {
    const cleared = clearToday(fresh(), 0);
    const more = recordFocus(cleared, 1, 20 * MIN, d(0, 18));

    expect(more.focusedMs).toBe(cleared.focusedMs + 20 * MIN);
    expect(more.offers).toEqual(cleared.offers);
    expect(more.stageIndex).toBe(1);
  });

  it('ignores focus for another quest and focus that is not positive', () => {
    const run = fresh();

    expect(recordFocus(run, 2, 30 * MIN, d(0))).toEqual(run);
    expect(recordFocus(run, 1, 0, d(0))).toEqual(run);
    expect(recordFocus(run, 1, -5 * MIN, d(0))).toEqual(run);
    expect(recordFocus(run, 1, NaN, d(0))).toEqual(run);
  });

  it('moves to the next stage first when focus arrives on a later day', () => {
    const cleared = clearToday(fresh(), 0);

    const next = recordFocus(cleared, 1, 7 * MIN, d(1));

    expect(next).toMatchObject({
      stageIndex: 2,
      focusedMs: 7 * MIN,
      cleared: false,
      results: ['cleared']
    });
  });

  it('settles a missed day before counting the new focus, so a failed run stays failed', () => {
    const run = fresh();

    const late = recordFocus(run, 1, 60 * MIN, d(1));

    expect(late.status).toBe('failed');
    expect(late.endDay).toBe('2026-10-27');
    expect(late.focusedMs).toBe(0);
  });

  it('ignores focus recorded before the run started, such as after the clock moved back', () => {
    const run = fresh();

    expect(recordFocus(run, 1, 10 * MIN, d(-2))).toEqual(run);
  });

  it('ignores focus once the run is over', () => {
    const over = abandonRun(fresh(), d(0));

    expect(recordFocus(over, 1, 10 * MIN, d(0))).toEqual(over);
  });
});

describe('advanceRun', () => {
  it('changes nothing during the day of the current stage', () => {
    const run = fresh();

    expect(advanceRun(run, d(0, 0))).toBe(run);
    expect(advanceRun(run, d(0, 23))).toBe(run);
  });

  it('moves a cleared stage on at midnight, resetting the day and dropping an unpicked offer', () => {
    const cleared = clearToday(fresh(), 0);
    expect(cleared.offers).not.toBeNull();

    const next = advanceRun(cleared, d(1, 0));

    expect(next).toMatchObject({
      stageIndex: 2,
      focusedMs: 0,
      cleared: false,
      offers: null,
      results: ['cleared'],
      status: 'active'
    });
    expect(next.quotaMinutes).toBe(next.stages[1].quotaMinutes);
    expect(next.perks).toEqual([]);
  });

  it('ends the run when a day passes without the quota and there is no Shield', () => {
    const run = recordFocus(fresh(), 1, 5 * MIN, d(0));

    const failed = advanceRun(run, d(1, 0));

    expect(failed).toMatchObject({
      status: 'failed',
      endDay: '2026-10-27',
      stageIndex: 1,
      results: []
    });
  });

  it('spends a Shield to forgive a missed day, and moves on', () => {
    const run = { ...fresh(), shields: 1 };

    const next = advanceRun(run, d(1, 0));

    expect(next).toMatchObject({
      status: 'active',
      stageIndex: 2,
      shields: 0,
      results: ['forgiven']
    });
  });

  it('settles every missed day in order after a long absence', () => {
    // Stage 1 on day 0, stage 2 on day 1, stage 3 on day 2: two Shields cover two of them.
    const run = { ...fresh(), shields: 2 };

    const next = advanceRun(run, d(3, 8));

    expect(next).toMatchObject({
      status: 'failed',
      stageIndex: 3,
      endDay: '2026-10-29',
      shields: 0,
      results: ['forgiven', 'forgiven']
    });
  });

  it('survives a very long absence only as far as the Shields reach', () => {
    const run = { ...fresh(), shields: 4 };

    const next = advanceRun(run, d(200));

    expect(next.status).toBe('failed');
    expect(next.stageIndex).toBe(5);
    expect(next.results).toHaveLength(4);
  });

  it('wins the run if the last stage is forgiven', () => {
    const run = { ...shortRun(), shields: 3 };

    const done = advanceRun(run, d(10));

    expect(done).toMatchObject({ status: 'completed', endDay: '2026-10-29' });
    expect(done.results).toEqual(['forgiven', 'forgiven', 'forgiven']);
  });

  it('applies a lighter quota to the next stage only', () => {
    const cleared = { ...clearToday(fresh(), 0), lighterNext: true };
    const planned = cleared.stages[1].quotaMinutes;

    const day1 = advanceRun(cleared, d(1));
    expect(day1.quotaMinutes).toBe(roundUpQuota(planned * LIGHTER_QUOTA_FACTOR));
    expect(day1.quotaMinutes).toBeLessThan(planned);
    expect(day1.lighterNext).toBe(false);

    const day2 = advanceRun(clearToday(day1, 1), d(2));
    expect(day2.quotaMinutes).toBe(day2.stages[2].quotaMinutes);
  });

  it('gives the same result whether called once or in steps', () => {
    const run = { ...fresh(), shields: 1 };

    expect(advanceRun(advanceRun(run, d(1)), d(5))).toEqual(advanceRun(run, d(5)));
    expect(advanceRun(advanceRun(run, d(5)), d(5))).toEqual(advanceRun(run, d(5)));
  });

  it('leaves a finished run alone', () => {
    for (const over of [abandonRun(fresh(), d(0)), advanceRun(fresh(), d(1))]) {
      expect(advanceRun(over, d(30))).toBe(over);
    }
  });
});

describe('winning a run', () => {
  it('completes the run when the last stage is cleared, on the day it happens', () => {
    let run = shortRun();
    expect(run.stages).toHaveLength(3);

    run = clearToday(run, 0);
    run = clearToday(advanceRun(run, d(1)), 1);
    expect(run.status).toBe('active');
    expect(run.stageIndex).toBe(2);

    run = clearToday(advanceRun(run, d(2)), 2);
    expect(run).toMatchObject({
      status: 'completed',
      stageIndex: 3,
      endDay: '2026-10-29',
      offers: null,
      results: ['cleared', 'cleared', 'cleared']
    });
  });

  it('keeps a completed run completed', () => {
    let run = shortRun();
    for (let day = 0; day < 3; day++) {
      run = clearToday(advanceRun(run, d(day)), day);
    }

    expect(advanceRun(run, d(40))).toBe(run);
    expect(recordFocus(run, 1, 99 * MIN, d(40))).toEqual(run);
  });

  it.each(Array.from({ length: 50 }, (_, seed) => seed))(
    'wins seed %i when every day is cleared, and fails exactly where a day is skipped',
    (seed) => {
      const plan = { goalId: 1, targetHours: 20, difficulty: 3, seed };
      const count = createRun(plan, d(0)).stages.length;

      // Clearing every day wins on the last day.
      let perfect = createRun(plan, d(0));
      for (let day = 0; day < count; day++) {
        perfect = clearToday(advanceRun(perfect, d(day)), day);
      }
      expect(perfect.status).toBe('completed');
      expect(perfect.results).toHaveLength(count);

      // Skipping day k fails the run on stage k, with k - 1 stages cleared.
      const skipped = Math.min(count - 1, 1 + (seed % 7));
      let run = createRun(plan, d(0));
      for (let day = 0; day < skipped; day++) {
        run = clearToday(advanceRun(run, d(day)), day);
      }
      const failed = advanceRun(run, d(skipped + 1, 0));

      expect(failed.status).toBe('failed');
      expect(failed.stageIndex).toBe(skipped + 1);
      expect(failed.results).toHaveLength(skipped);
      expect(failed.endDay).toBe(stageDay(failed, skipped + 1));
    }
  );
});

describe('pickPerk', () => {
  const offered = (): RunState =>
    withOffers(clearToday(fresh(), 0), ['shield', 'xpBoost', 'lighterQuota']);

  it('gives a Shield', () => {
    const run = pickPerk(offered(), 'shield', d(0, 12));

    expect(run).toMatchObject({ shields: 1, offers: null, perks: ['shield'] });
  });

  it('gives an XP boost that stacks', () => {
    let run = pickPerk(offered(), 'xpBoost', d(0, 12));
    expect(run.xpBoostPercent).toBe(25);
    expect(xpMultiplier(run)).toBe(1.25);

    run = pickPerk(withOffers(run, ['xpBoost']), 'xpBoost', d(0, 13));
    expect(run.xpBoostPercent).toBe(50);
    expect(xpMultiplier(run)).toBe(1.5);
  });

  it('makes the next quota lighter', () => {
    const run = pickPerk(offered(), 'lighterQuota', d(0, 12));

    expect(run.lighterNext).toBe(true);
    expect(run.perks).toEqual(['lighterQuota']);
  });

  it('gives a Reroll token', () => {
    const run = pickPerk(
      withOffers(clearToday(fresh(), 0), ['reroll', 'shield', 'xpBoost']),
      'reroll',
      d(0, 12)
    );

    expect(run.rerolls).toBe(1);
  });

  it('works with the offer the run really made', () => {
    const cleared = clearToday(fresh(), 0);
    const pick = cleared.offers![0];

    const run = pickPerk(cleared, pick, d(0, 12));

    expect(run.perks).toEqual([pick]);
    expect(run.offers).toBeNull();
  });

  it('refuses a perk that is not on offer, or when nothing is on offer', () => {
    const run = offered();

    expect(() => pickPerk(run, 'reroll', d(0))).toThrow('not on offer');
    expect(() => pickPerk(fresh(), 'shield', d(0))).toThrow('no perk to pick');
  });

  it('refuses a second pick from the same offer', () => {
    const run = pickPerk(offered(), 'shield', d(0, 12));

    expect(() => pickPerk(run, 'xpBoost', d(0, 13))).toThrow('no perk to pick');
  });

  it('refuses a pick once the offer expired at midnight', () => {
    expect(() => pickPerk(offered(), 'shield', d(1, 1))).toThrow('no perk to pick');
  });

  it('refuses a pick when the run is over', () => {
    const over = abandonRun(offered(), d(0, 12));

    expect(() => pickPerk(over, 'shield', d(0, 13))).toThrow(RunError);
  });
});

describe('rerollOffers', () => {
  it('spends a token and redraws the offer the same way every time', () => {
    const cleared = { ...clearToday(fresh(), 0), rerolls: 2 };

    const redrawn = rerollOffers(cleared, d(0, 12));

    expect(redrawn.rerolls).toBe(1);
    expect(redrawn.redraws).toBe(1);
    expect(redrawn.offers).toEqual(offerPerks(7, 1, 1));
    expect(rerollOffers(cleared, d(0, 12))).toEqual(redrawn);

    const again = rerollOffers(redrawn, d(0, 13));
    expect(again.rerolls).toBe(0);
    expect(again.offers).toEqual(offerPerks(7, 1, 2));
  });

  it('refuses without a token or without an offer', () => {
    expect(() => rerollOffers(clearToday(fresh(), 0), d(0, 12))).toThrow('No rerolls left');
    expect(() => rerollOffers({ ...fresh(), rerolls: 1 }, d(0))).toThrow('no offers');
  });

  it('starts a new draft the next time, with the redraw count back at zero', () => {
    const cleared = { ...clearToday(fresh(), 0), rerolls: 1 };
    const redrawn = rerollOffers(cleared, d(0, 12));

    const next = clearToday(advanceRun(redrawn, d(1)), 1);

    expect(next.redraws).toBe(0);
    expect(next.offers).toEqual(offerPerks(7, 2, 0));
  });

  it('keeps unused tokens for later drafts', () => {
    const cleared = { ...clearToday(fresh(), 0), rerolls: 1 };

    expect(advanceRun(cleared, d(1)).rerolls).toBe(1);
  });
});

describe('abandonRun', () => {
  it('ends the run on the day it is abandoned', () => {
    const run = abandonRun(recordFocus(fresh(), 1, 10 * MIN, d(0)), d(0, 15));

    expect(run).toMatchObject({ status: 'abandoned', endDay: '2026-10-27', offers: null });
  });

  it('fails first if a day was already missed, and then there is nothing left to abandon', () => {
    expect(() => abandonRun(fresh(), d(2))).toThrow('already over');
  });

  it('cannot be done twice', () => {
    const run = abandonRun(fresh(), d(0));

    expect(() => abandonRun(run, d(0, 12))).toThrow('already over');
  });
});

describe('purity and saving', () => {
  it('never changes a state it is given', () => {
    let run = deepFreeze(shortRun());
    run = deepFreeze(recordFocus(run, 1, 5 * MIN, d(0)));
    run = deepFreeze(clearToday(run, 0));
    run = deepFreeze(pickPerk(run, run.offers![0], d(0, 12)));
    run = deepFreeze(advanceRun(run, d(1)));
    run = deepFreeze(recordFocus(run, 1, 3 * MIN, d(1, 12)));
    run = deepFreeze(abandonRun(run, d(1, 13)));

    expect(run.status).toBe('abandoned');

    // A missed day with a Shield, and one without, also leave their input untouched.
    const spare = deepFreeze({ ...shortRun(), shields: 1 });
    expect(advanceRun(spare, d(5)).status).toBe('failed');
    expect(spare.shields).toBe(1);
  });

  it('survives being saved as JSON and loaded again at any moment', () => {
    const run = pickPerk(clearToday(fresh(), 0), clearToday(fresh(), 0).offers![0], d(0, 12));
    const restored = JSON.parse(JSON.stringify(run)) as RunState;

    expect(restored).toEqual(run);
    expect(advanceRun(restored, d(4))).toEqual(advanceRun(run, d(4)));
    expect(recordFocus(restored, 1, 10 * MIN, d(1))).toEqual(recordFocus(run, 1, 10 * MIN, d(1)));
  });

  it('offers only perks that exist', () => {
    for (let seed = 0; seed < 30; seed++) {
      const run = clearToday(fresh({ seed }), 0);
      expect(run.offers!.every((perk) => PERK_IDS.includes(perk))).toBe(true);
    }
  });
});
