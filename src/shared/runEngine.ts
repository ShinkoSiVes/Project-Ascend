// The run state machine. Every function is pure: it takes the current state and the time (epoch
// ms) and returns a new state, never changing the old one and never reading the clock. That
// makes every rule testable without waiting a day, and a run can be saved and restored at any
// moment.

import type { Strictness } from './goal';
import {
  DISTRACTION_HP_COST,
  GENTLE_REVIVES,
  LIGHTER_QUOTA_FACTOR,
  MAX_HP,
  REVIVE_HP,
  STAGE_HEAL_HP,
  XP_BOOST_PERCENT,
  checkRunInput,
  dayKey,
  generateStages,
  offerPerks,
  roundUpQuota,
  stageDay,
  type PerkId,
  type RunState,
  type StageResult
} from './run';
import { MS_PER_MINUTE } from './session';

// Thrown when something is asked that the run cannot do right now.
export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunError';
  }
}

// Builds a new run starting today. The input comes from the renderer or the main process, so it
// is checked.
export function createRun(input: unknown, now: number): RunState {
  if (typeof input !== 'object' || input === null) {
    throw new RunError('Invalid run');
  }
  const fields = input as Record<string, unknown>;

  const [firstError] = Object.values(checkRunInput(fields));
  if (firstError) {
    throw new RunError(firstError);
  }

  const goalId = fields.goalId as number;
  const seed = fields.seed as number;
  const stages = generateStages({
    seed,
    targetHours: fields.targetHours as number,
    difficulty: fields.difficulty as number
  });

  return {
    goalId,
    seed,
    startDay: dayKey(now),
    stages,
    stageIndex: 1,
    quotaMinutes: stages[0].quotaMinutes,
    focusedMs: 0,
    cleared: false,
    results: [],
    status: 'active',
    endDay: null,
    offers: null,
    redraws: 0,
    shields: 0,
    rerolls: 0,
    xpBoostPercent: 0,
    lighterNext: false,
    perks: [],
    hp: MAX_HP,
    revivesUsed: 0,
    failReason: null
  };
}

// The day of a stage is over. Settles how it ended and moves on to the next stage, or ends
// the run.
function settleStage(run: RunState): RunState {
  const lastDay = stageDay(run, run.stageIndex);
  let shields = run.shields;
  let result: StageResult;

  if (run.cleared) {
    result = 'cleared';
  } else if (shields > 0) {
    result = 'forgiven';
    shields -= 1;
  } else {
    // A missed quota with no Shield left ends the run.
    return { ...run, status: 'failed', failReason: 'quota', endDay: lastDay, offers: null };
  }

  const results = [...run.results, result];
  if (run.stageIndex >= run.stages.length) {
    return { ...run, shields, results, status: 'completed', endDay: lastDay, offers: null };
  }

  const stageIndex = run.stageIndex + 1;
  const planned = run.stages[stageIndex - 1].quotaMinutes;
  return {
    ...run,
    shields,
    results,
    stageIndex,
    quotaMinutes: run.lighterNext ? roundUpQuota(planned * LIGHTER_QUOTA_FACTOR) : planned,
    focusedMs: 0,
    cleared: false,
    // An offer that was never picked is gone with the day it was made.
    offers: null,
    redraws: 0,
    lighterNext: false
  };
}

// Brings the run up to date with the calendar. Every stage whose day has passed is settled in
// order, so a run that was not opened for several days still ends up exactly where the
// calendar says it should be.
export function advanceRun(run: RunState, now: number): RunState {
  const today = dayKey(now);
  let current = run;

  while (current.status === 'active' && today > stageDay(current, current.stageIndex)) {
    current = settleStage(current);
  }
  return current;
}

// The quota of the current stage has been met.
function clearStage(run: RunState, today: string): RunState {
  if (run.stageIndex >= run.stages.length) {
    // Clearing the last stage wins the run.
    return {
      ...run,
      cleared: true,
      results: [...run.results, 'cleared'],
      status: 'completed',
      endDay: today,
      offers: null
    };
  }
  return {
    ...run,
    cleared: true,
    // Clearing a stage heals the pet, up to full.
    hp: Math.min(MAX_HP, run.hp + STAGE_HEAL_HP),
    offers: offerPerks(run.seed, run.stageIndex, 0),
    redraws: 0
  };
}

// A blocked app was in front for longer than the grace period. It costs HP. At 0 HP a Gentle run
// is revived once, and any other run fails. Strictness belongs to the quest, so the caller passes it.
export function loseHp(run: RunState, strictness: Strictness, now: number): RunState {
  const current = advanceRun(run, now);

  if (current.status !== 'active') {
    return current;
  }

  const hp = Math.max(0, current.hp - DISTRACTION_HP_COST);
  if (hp > 0) {
    return { ...current, hp };
  }
  if (strictness === 'gentle' && current.revivesUsed < GENTLE_REVIVES) {
    return { ...current, hp: REVIVE_HP, revivesUsed: current.revivesUsed + 1 };
  }
  return {
    ...current,
    hp: 0,
    status: 'failed',
    failReason: 'hp',
    endDay: dayKey(now),
    offers: null
  };
}

// Counts focus time toward today's stage, if it is for the run's quest. Reaching the quota
// clears the stage. Focus after that still counts here but only earns XP, because the next
// stage is tomorrow's.
export function recordFocus(
  run: RunState,
  goalId: number,
  focusedMs: number,
  now: number
): RunState {
  const current = advanceRun(run, now);
  const today = dayKey(now);

  if (
    current.status !== 'active' ||
    current.goalId !== goalId ||
    !(focusedMs > 0) ||
    today !== stageDay(current, current.stageIndex)
  ) {
    return current;
  }

  const counted = { ...current, focusedMs: current.focusedMs + focusedMs };
  if (!counted.cleared && counted.focusedMs >= counted.quotaMinutes * MS_PER_MINUTE) {
    return clearStage(counted, today);
  }
  return counted;
}

// Takes one of the perks on offer.
export function pickPerk(run: RunState, perk: PerkId, now: number): RunState {
  const current = advanceRun(run, now);

  if (current.status !== 'active' || current.offers === null) {
    throw new RunError('There is no perk to pick');
  }
  if (!current.offers.includes(perk)) {
    throw new RunError('That perk is not on offer');
  }

  const taken: RunState = { ...current, offers: null, perks: [...current.perks, perk] };
  switch (perk) {
    case 'shield':
      return { ...taken, shields: taken.shields + 1 };
    case 'xpBoost':
      return { ...taken, xpBoostPercent: taken.xpBoostPercent + XP_BOOST_PERCENT };
    case 'lighterQuota':
      return { ...taken, lighterNext: true };
    case 'reroll':
      return { ...taken, rerolls: taken.rerolls + 1 };
  }
}

// Spends a Reroll token to redraw the perks on offer.
export function rerollOffers(run: RunState, now: number): RunState {
  const current = advanceRun(run, now);

  if (current.status !== 'active' || current.offers === null) {
    throw new RunError('There are no offers to redraw');
  }
  if (current.rerolls < 1) {
    throw new RunError('No rerolls left');
  }

  const redraws = current.redraws + 1;
  return {
    ...current,
    rerolls: current.rerolls - 1,
    redraws,
    offers: offerPerks(current.seed, current.stageIndex, redraws)
  };
}

// Ends the run early, by choice.
export function abandonRun(run: RunState, now: number): RunState {
  const current = advanceRun(run, now);

  if (current.status !== 'active') {
    throw new RunError('The run is already over');
  }
  return { ...current, status: 'abandoned', endDay: dayKey(now), offers: null };
}
