// The roguelike run: its stages, daily quotas, perks and read-only helpers.
// Everything here is plain data and pure functions with no clock and no storage, so the main
// process and the renderer can both use it. The transitions live in runEngine.ts.
//
// A run is a path of stages. Each stage is one calendar day with a focus quota: reach it that day
// to clear the stage and pick a perk. Miss it and a Shield forgives it, or the run fails.

import { MAX_DIFFICULTY, MAX_TARGET_HOURS, MIN_DIFFICULTY, MIN_TARGET_HOURS } from './goal';
import { MS_PER_MINUTE } from './session';

// ---- Numbers that shape a run. Change them here and in the docs together.

// The daily quota in minutes for difficulty 1 to 5, before the run ramps it up.
export const BASE_QUOTA_MINUTES = [20, 30, 45, 60, 90] as const;
// The last stage asks this much more than the first, growing evenly in between.
export const QUOTA_RAMP = 0.5;
export const BOSS_QUOTA_FACTOR = 1.5;
export const REST_QUOTA_FACTOR = 0.5;
export const LIGHTER_QUOTA_FACTOR = 0.7;
// Every quota is rounded up to a multiple of this many minutes, and is never smaller than it.
export const QUOTA_STEP_MINUTES = 5;

export const MIN_STAGES = 3;
export const MAX_STAGES = 30;
// Every Nth stage, and always the last one, is a boss day.
export const BOSS_EVERY = 5;
// A rest day is a lighter day. It never comes first, never on a boss day, and never closer than
// this many stages to another rest day.
export const REST_CHANCE = 0.25;
export const REST_SPACING = 6;

export const PERKS_OFFERED = 3;
export const XP_BOOST_PERCENT = 25;

// ---- Seeded randomness, so the same seed always builds the same run.

// A small, fast random number generator. It returns numbers from 0 up to (not including) 1.
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A new seed: a whole number from 0 to 2^32 - 1.
export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 4294967296) >>> 0;
}

export function isValidSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 4294967296;
}

// ---- Calendar days. A day is written 'YYYY-MM-DD' in local time.

const pad = (value: number): string => String(value).padStart(2, '0');

// The local calendar day a moment falls on.
export function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The day this many days after (or, if negative, before) a day. It is plain calendar maths, so
// daylight saving changes cannot shift it.
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

// How many days from the first day to the second. Negative if the second comes first.
export function daysBetween(from: string, to: string): number {
  const toUtc = (day: string): number => {
    const [year, month, date] = day.split('-').map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

// ---- Stages

export type StageKind = 'normal' | 'rest' | 'boss';

export interface Stage {
  // Counting from 1.
  index: number;
  kind: StageKind;
  quotaMinutes: number;
}

export function roundUpQuota(minutes: number): number {
  return Math.max(QUOTA_STEP_MINUTES, Math.ceil(minutes / QUOTA_STEP_MINUTES) * QUOTA_STEP_MINUTES);
}

// How many stages a quest's run has: enough days to reach the target hours at an average
// quota, kept between 3 and 30.
export function stageCount(targetHours: number, difficulty: number): number {
  const averageQuota = BASE_QUOTA_MINUTES[difficulty - 1] * (1 + QUOTA_RAMP / 2);
  const wanted = Math.ceil((targetHours * 60) / averageQuota);
  return Math.min(MAX_STAGES, Math.max(MIN_STAGES, wanted));
}

export interface RunPlan {
  seed: number;
  targetHours: number;
  difficulty: number;
}

// Builds the stage map for a run. The same plan always gives the same stages.
export function generateStages(plan: RunPlan): Stage[] {
  const base = BASE_QUOTA_MINUTES[plan.difficulty - 1];
  const count = stageCount(plan.targetHours, plan.difficulty);
  const random = mulberry32(plan.seed);
  const stages: Stage[] = [];
  let lastRest = -Infinity;

  for (let index = 1; index <= count; index++) {
    // One roll per stage, always, so a change to the rules cannot shift the rolls of later stages.
    const roll = random();

    const boss = index === count || index % BOSS_EVERY === 0;
    const rest = !boss && index > 1 && index - lastRest >= REST_SPACING && roll < REST_CHANCE;
    const kind: StageKind = boss ? 'boss' : rest ? 'rest' : 'normal';
    if (rest) {
      lastRest = index;
    }

    const progress = count === 1 ? 0 : (index - 1) / (count - 1);
    const factor = kind === 'boss' ? BOSS_QUOTA_FACTOR : kind === 'rest' ? REST_QUOTA_FACTOR : 1;
    stages.push({
      index,
      kind,
      quotaMinutes: roundUpQuota(base * (1 + QUOTA_RAMP * progress) * factor)
    });
  }

  return stages;
}

// ---- Perks

export const PERK_IDS = ['shield', 'xpBoost', 'lighterQuota', 'reroll'] as const;
export type PerkId = (typeof PERK_IDS)[number];

export const PERKS: Record<PerkId, { name: string; blurb: string }> = {
  shield: { name: 'Shield', blurb: 'Forgives one missed daily quota.' },
  xpBoost: {
    name: 'XP boost',
    blurb: `+${XP_BOOST_PERCENT}% XP from focus sessions for the rest of the run.`
  },
  lighterQuota: { name: 'Lighter quota', blurb: "Tomorrow's quota is 30% smaller." },
  reroll: { name: 'Reroll', blurb: 'Redraw the perk offers once, at any later draft.' }
};

// Mixes a run seed, a stage and a redraw count into one seed for that draft.
function draftSeed(seed: number, stageIndex: number, redraw: number): number {
  return (seed ^ Math.imul(stageIndex, 0x9e3779b1) ^ Math.imul(redraw + 1, 0x85ebca6b)) >>> 0;
}

// The perks on offer after clearing a stage: PERKS_OFFERED different ones, chosen by shuffling
// with a seed. The same run, stage and redraw count always give the same offer.
export function offerPerks(seed: number, stageIndex: number, redraw: number): PerkId[] {
  const random = mulberry32(draftSeed(seed, stageIndex, redraw));
  const pool = [...PERK_IDS];

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, PERKS_OFFERED);
}

// ---- The state of a run

export type RunStatus = 'active' | 'failed' | 'completed' | 'abandoned';
export type StageResult = 'cleared' | 'forgiven';

export interface RunState {
  goalId: number;
  seed: number;
  // The day stage 1 takes place. Stage k takes place on startDay + k - 1.
  startDay: string;
  stages: Stage[];
  // The current stage, counting from 1.
  stageIndex: number;
  // What the current stage asks for after perks.
  quotaMinutes: number;
  // Focus time counted toward the current stage today.
  focusedMs: number;
  // Whether the current stage's quota has been met.
  cleared: boolean;
  // How each finished stage ended.
  results: StageResult[];
  status: RunStatus;
  // The last day of the run, once it is over.
  endDay: string | null;
  // The perks on offer right now, or null when there is no draft.
  offers: PerkId[] | null;
  // How many times the current draft has been redrawn.
  redraws: number;
  shields: number;
  // Reroll tokens in hand.
  rerolls: number;
  xpBoostPercent: number;
  // Whether the next stage's quota is lightened.
  lighterNext: boolean;
  // The perks picked so far, in order.
  perks: PerkId[];
}

export function stageDay(run: RunState, stageIndex: number): string {
  return addDays(run.startDay, stageIndex - 1);
}

export function currentStage(run: RunState): Stage {
  return run.stages[run.stageIndex - 1];
}

export function isOver(run: RunState): boolean {
  return run.status !== 'active';
}

// How much more focus the current stage needs, in milliseconds.
export function remainingQuotaMs(run: RunState): number {
  return Math.max(0, run.quotaMinutes * MS_PER_MINUTE - run.focusedMs);
}

// How many stages were cleared or forgiven, counting the current one if it is already cleared.
export function stagesCleared(run: RunState): number {
  return run.results.length + (run.status === 'active' && run.cleared ? 1 : 0);
}

// The multiplier on session XP while the run is active.
export function xpMultiplier(run: RunState): number {
  return run.status === 'active' ? 1 + run.xpBoostPercent / 100 : 1;
}

export type RunInputErrors = Partial<
  Record<'goalId' | 'targetHours' | 'difficulty' | 'seed', string>
>;

// Checks what is needed to start a run and returns a message per invalid field.
export function checkRunInput(input: Record<string, unknown>): RunInputErrors {
  const { goalId, targetHours, difficulty, seed } = input;
  const errors: RunInputErrors = {};

  if (typeof goalId !== 'number' || !Number.isInteger(goalId) || goalId < 1) {
    errors.goalId = 'Choose a quest for the run';
  }
  if (
    typeof targetHours !== 'number' ||
    !Number.isFinite(targetHours) ||
    targetHours < MIN_TARGET_HOURS ||
    targetHours > MAX_TARGET_HOURS
  ) {
    errors.targetHours = `Target hours must be between ${MIN_TARGET_HOURS} and ${MAX_TARGET_HOURS}`;
  }
  if (
    typeof difficulty !== 'number' ||
    !Number.isInteger(difficulty) ||
    difficulty < MIN_DIFFICULTY ||
    difficulty > MAX_DIFFICULTY
  ) {
    errors.difficulty = `Difficulty must be a whole number from ${MIN_DIFFICULTY} to ${MAX_DIFFICULTY}`;
  }
  if (!isValidSeed(seed)) {
    errors.seed = 'The seed must be a whole number from 0 to 4294967295';
  }

  return errors;
}
