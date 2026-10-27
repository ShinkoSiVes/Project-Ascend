import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { PERK_IDS, offerPerks, type RunState } from '../../shared/run';
import { RunError } from '../../shared/runEngine';
import { DEFAULT_SESSION_CONFIG, MS_PER_MINUTE, type SessionState } from '../../shared/session';
import { abandonSession, createSession, startSession } from '../../shared/sessionEngine';
import { openDatabase } from '../db/database';
import { createGoal } from '../db/goals';
import { loadActiveRun } from '../db/runs';
import { RunManager } from './runManager';

const MIN = MS_PER_MINUTE;

// A moment `days` after 27 October 2026 at the given hour, in local time.
const at = (days: number, hour = 10): number => new Date(2026, 9, 27 + days, hour, 0, 0).getTime();

let db: DatabaseSync;
let goalId: number;
let time: number;
let changes: RunState[];

function newManager(): RunManager {
  return new RunManager(db, {
    now: () => time,
    random: () => 0.5,
    onChange: (state) => changes.push(state)
  });
}

// A finished session for a goal, with the given focus time, ending at the given moment.
function finishedSession(forGoal: number, focusedMinutes: number, endedAt: number): SessionState {
  // The focus round is as long as the time asked for, so all of it counts.
  const base = createSession({
    goalId: forGoal,
    todoId: null,
    config: { ...DEFAULT_SESSION_CONFIG, focusMinutes: Math.min(180, Math.max(1, focusedMinutes)) }
  });
  const started = startSession(base, endedAt - focusedMinutes * MIN);
  return abandonSession(started, endedAt);
}

function savedStatus(): string {
  return (
    db.prepare('SELECT status FROM runs ORDER BY id DESC LIMIT 1').get() as { status: string }
  ).status;
}

// Starts a run and clears today's stage by recording a session that meets its quota.
function clearToday(manager: RunManager, run: RunState, day: number): void {
  manager.recordSession(finishedSession(run.goalId, run.quotaMinutes, at(day, 12)));
}

beforeEach(() => {
  db = openDatabase(':memory:');
  goalId = createGoal(db, {
    title: 'Study',
    targetHours: 10,
    difficulty: 2,
    strictness: 'gentle'
  }).id;
  time = at(0);
  changes = [];
});

describe('start', () => {
  it('starts a run from the quest, reading its hours and difficulty itself', () => {
    const manager = newManager();

    const run = manager.start({ goalId });

    // 10 hours at difficulty 2 (30 minutes a day) is 16 stages, with a 30 minute first day.
    expect(run.stages).toHaveLength(16);
    expect(run.quotaMinutes).toBe(30);
    expect(run).toMatchObject({ goalId, status: 'active', startDay: '2026-10-27', stageIndex: 1 });
    expect(changes).toEqual([run]);
    expect(savedStatus()).toBe('active');
  });

  it('uses the random source for the seed, so the same source gives the same run', () => {
    const first = newManager().start({ goalId });
    db.prepare("UPDATE runs SET status = 'abandoned'").run();
    const second = newManager().start({ goalId });

    expect(second.seed).toBe(first.seed);
    expect(second.stages).toEqual(first.stages);
  });

  it('ignores hours or difficulty sent by the caller', () => {
    const run = newManager().start({ goalId, targetHours: 1000, difficulty: 5, seed: 1 } as never);

    expect(run.stages).toHaveLength(16);
    expect(run.seed).not.toBe(1);
  });

  it('refuses a second run while one is active', () => {
    const manager = newManager();
    manager.start({ goalId });

    expect(() => manager.start({ goalId })).toThrow('already active');
  });

  it('allows a new run after the last one was abandoned', () => {
    const manager = newManager();
    manager.start({ goalId });
    manager.abandon();

    expect(() => manager.start({ goalId })).not.toThrow();
  });

  it.each([
    ['null', null],
    ['text', 'run'],
    ['a missing quest', {}],
    ['a quest id of 0', { goalId: 0 }],
    ['a quest id as text', { goalId: '1' }]
  ])('rejects %s', (_name, input) => {
    expect(() => newManager().start(input)).toThrow(RunError);
  });

  it('rejects a quest that does not exist', () => {
    expect(() => newManager().start({ goalId: 9999 })).toThrow('Quest not found');
  });
});

describe('recordSession', () => {
  it('counts a session for the run quest toward today and tells the listener', () => {
    const manager = newManager();
    manager.start({ goalId });
    changes = [];

    manager.recordSession(finishedSession(goalId, 10, at(0, 12)));

    expect(manager.current()).toMatchObject({ focusedMs: 10 * MIN, cleared: false });
    expect(changes).toHaveLength(1);
  });

  it('ignores a session for another quest', () => {
    const manager = newManager();
    const run = manager.start({ goalId });
    const other = createGoal(db, {
      title: 'Other',
      targetHours: 5,
      difficulty: 1,
      strictness: 'gentle'
    });
    changes = [];

    manager.recordSession(finishedSession(other.id, 99, at(0, 12)));

    expect(manager.current()).toEqual(run);
    expect(changes).toEqual([]);
  });

  it('clears the stage when the quota is met and offers perks', () => {
    const manager = newManager();
    const run = manager.start({ goalId });

    clearToday(manager, run, 0);

    const current = manager.current()!;
    expect(current.cleared).toBe(true);
    expect(current.offers).toEqual(offerPerks(run.seed, 1, 0));
  });

  it('does nothing without a run', () => {
    const manager = newManager();

    expect(() => manager.recordSession(finishedSession(goalId, 30, at(0, 12)))).not.toThrow();
    expect(changes).toEqual([]);
  });

  it('counts a session that ended earlier than now toward the day it ended', () => {
    const manager = newManager();
    const run = manager.start({ goalId });
    time = at(0, 12);

    // A session closed by crash recovery later reports the day it really ended on.
    manager.recordSession(finishedSession(goalId, run.quotaMinutes, at(0, 11)));

    expect(manager.current()).toMatchObject({ cleared: true, stageIndex: 1 });
  });
});

describe('perks', () => {
  function clearedRun(manager: RunManager): RunState {
    const run = manager.start({ goalId });
    clearToday(manager, run, 0);
    return manager.current()!;
  }

  it('takes a perk that is on offer and saves it', () => {
    const manager = newManager();
    const cleared = clearedRun(manager);
    const pick = cleared.offers![0];

    const run = manager.pickPerk({ perk: pick });

    expect(run.perks).toEqual([pick]);
    expect(run.offers).toBeNull();
    expect(loadActiveRun(db)?.state.perks).toEqual([pick]);
  });

  it('refuses a perk that is not on offer, an unknown perk and a malformed request', () => {
    const manager = newManager();
    const cleared = clearedRun(manager);
    const notOffered = PERK_IDS.find((perk) => !cleared.offers!.includes(perk))!;

    expect(() => manager.pickPerk({ perk: notOffered })).toThrow('not on offer');
    expect(() => manager.pickPerk({ perk: 'cheat' })).toThrow('Unknown perk');
    expect(() => manager.pickPerk(null)).toThrow(RunError);
    expect(() => manager.pickPerk({})).toThrow('Unknown perk');
  });

  it('redraws the offers with a Reroll token', () => {
    const manager = newManager();
    const cleared = clearedRun(manager);
    db.prepare("UPDATE runs SET state = json_set(state, '$.rerolls', 1)").run();
    manager.load();

    expect(manager.current()!.rerolls).toBe(1);
    const redrawn = manager.reroll();

    expect(redrawn.offers).toEqual(offerPerks(cleared.seed, 1, 1));
    expect(redrawn.rerolls).toBe(0);
  });

  it('refuses a reroll without a token', () => {
    const manager = newManager();
    clearedRun(manager);

    expect(() => manager.reroll()).toThrow('No rerolls left');
  });

  it('refuses every action when there is no run', () => {
    const manager = newManager();

    expect(() => manager.pickPerk({ perk: 'shield' })).toThrow('no active run');
    expect(() => manager.reroll()).toThrow('no active run');
    expect(() => manager.abandon()).toThrow('no active run');
  });
});

describe('the daily rollover', () => {
  it('moves to the next stage at midnight and tells the listener', () => {
    const manager = newManager();
    const run = manager.start({ goalId });
    clearToday(manager, run, 0);
    changes = [];

    time = at(1, 0);
    manager.tick();

    expect(manager.current()).toMatchObject({ stageIndex: 2, cleared: false, offers: null });
    expect(changes).toHaveLength(1);
    expect(loadActiveRun(db)?.state.stageIndex).toBe(2);
  });

  it('does nothing during the day', () => {
    const manager = newManager();
    manager.start({ goalId });
    changes = [];

    time = at(0, 23);
    manager.tick();
    manager.tick();

    expect(changes).toEqual([]);
  });

  it('fails the run when a day passes without the quota, and keeps the result to read', () => {
    const manager = newManager();
    manager.start({ goalId });
    changes = [];

    time = at(1, 0);
    manager.tick();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ status: 'failed', endDay: '2026-10-27' });
    expect(savedStatus()).toBe('failed');
    // The result stays on hand until it is dismissed.
    expect(manager.current()).toMatchObject({ status: 'failed' });
    expect(manager.current()).toMatchObject({ status: 'failed' });

    manager.dismiss();
    expect(manager.current()).toBeNull();
  });

  it('keeps showing a failure that happened while the app was closed', () => {
    newManager().start({ goalId });

    // Three days later a new manager starts, as after a relaunch.
    time = at(3, 9);
    const relaunched = newManager();
    relaunched.load();
    relaunched.tick();

    expect(relaunched.current()).toMatchObject({ status: 'failed', endDay: '2026-10-27' });
  });

  it('settles several missed days in one go after a long absence', () => {
    newManager().start({ goalId });
    db.prepare("UPDATE runs SET state = json_set(state, '$.shields', 2)").run();

    time = at(5, 9);
    const relaunched = newManager();
    relaunched.load();
    relaunched.tick();

    const state = relaunched.current()!;
    expect(state).toMatchObject({ status: 'failed', stageIndex: 3, endDay: '2026-10-29' });
    expect(state.results).toEqual(['forgiven', 'forgiven']);
  });

  it('starting a new run marks the old result as read', () => {
    const manager = newManager();
    manager.start({ goalId });
    time = at(1, 0);
    manager.tick();

    manager.start({ goalId });

    expect(manager.current()).toMatchObject({ status: 'active' });
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM runs WHERE seen = 0').get() as { n: number }).n
    ).toBe(0);
  });
});

describe('abandon, dismiss and history', () => {
  it('abandons the run, ends it and leaves nothing to read', () => {
    const manager = newManager();
    manager.start({ goalId });

    const run = manager.abandon();

    expect(run.status).toBe('abandoned');
    expect(manager.current()).toBeNull();
    expect(savedStatus()).toBe('abandoned');
  });

  it('lists finished runs and keeps stats after a run ends', () => {
    const manager = newManager();
    manager.start({ goalId });
    time = at(1, 0);
    manager.tick();
    manager.dismiss();
    manager.start({ goalId });

    expect(manager.history()).toHaveLength(1);
    expect(manager.history()[0]).toMatchObject({
      status: 'failed',
      goalTitle: 'Study',
      stageReached: 1
    });
    expect(manager.stats()).toMatchObject({ bestStage: 1, runsPlayed: 1, runsWon: 0 });
  });

  it('adds the focus of finished sessions to the stats', () => {
    const manager = newManager();
    const session = finishedSession(goalId, 20, at(0, 12));
    db.prepare(
      "INSERT INTO sessions (goal_id, state, phase, focused_ms, end_reason, last_seen_ms) VALUES (?, '{}', 'ended', ?, 'abandoned', 1)"
    ).run(goalId, session.focusedMs);

    expect(manager.stats().totalFocusMs).toBe(20 * MIN);
  });
});

describe('loseHp', () => {
  it('takes HP from the active run, saves it and tells the listener', () => {
    const manager = newManager();
    manager.start({ goalId });
    changes = [];

    manager.loseHp(goalId, 'medium');

    expect(changes).toHaveLength(1);
    expect(changes[0].hp).toBe(90);
    expect(loadActiveRun(db)?.state.hp).toBe(90);
  });

  it('does nothing when there is no run', () => {
    const manager = newManager();

    manager.loseHp(goalId, 'medium');

    expect(changes).toEqual([]);
  });

  it('does nothing for a session of another quest', () => {
    const manager = newManager();
    manager.start({ goalId });
    changes = [];

    manager.loseHp(goalId + 1, 'medium');

    expect(changes).toEqual([]);
    expect(loadActiveRun(db)?.state.hp).toBe(100);
  });

  it('fails the run at 0 HP on medium, and keeps it on hand as a result to read', () => {
    const manager = newManager();
    manager.start({ goalId });

    for (let i = 0; i < 10; i++) {
      manager.loseHp(goalId, 'medium');
    }

    expect(savedStatus()).toBe('failed');
    expect(manager.current()).toMatchObject({ status: 'failed', failReason: 'hp', hp: 0 });
  });

  it('revives a gentle run once at half HP, then lets it fail', () => {
    const manager = newManager();
    manager.start({ goalId });

    for (let i = 0; i < 10; i++) {
      manager.loseHp(goalId, 'gentle');
    }
    expect(manager.current()).toMatchObject({ status: 'active', hp: 50, revivesUsed: 1 });

    for (let i = 0; i < 5; i++) {
      manager.loseHp(goalId, 'gentle');
    }
    expect(manager.current()).toMatchObject({ status: 'failed', failReason: 'hp' });
  });

  it('does nothing once the run has ended', () => {
    const manager = newManager();
    manager.start({ goalId });
    manager.abandon();
    changes = [];

    manager.loseHp(goalId, 'medium');

    expect(changes).toEqual([]);
  });
});

describe('xpMultiplierFor', () => {
  function withBoost(manager: RunManager): void {
    manager.start({ goalId });
    db.prepare("UPDATE runs SET state = json_set(state, '$.xpBoostPercent', 50)").run();
    manager.load();
  }

  it('is 1 without a run', () => {
    expect(newManager().xpMultiplierFor(goalId, at(0))).toBe(1);
  });

  it('is the run boost for the run quest, and 1 for another quest', () => {
    const manager = newManager();
    withBoost(manager);

    expect(manager.xpMultiplierFor(goalId, at(0, 12))).toBe(1.5);
    expect(manager.xpMultiplierFor(goalId + 1, at(0, 12))).toBe(1);
  });

  it('looks at the run as it stood at that moment, without changing it', () => {
    const manager = newManager();
    withBoost(manager);
    changes = [];

    // At a moment days later the run would have failed, so the boost no longer applies there.
    expect(manager.xpMultiplierFor(goalId, at(4))).toBe(1);
    expect(manager.xpMultiplierFor(goalId, at(0, 12))).toBe(1.5);
    expect(changes).toEqual([]);
    expect(savedStatus()).toBe('active');
  });

  it('is 1 once the run has ended', () => {
    const manager = newManager();
    withBoost(manager);
    manager.abandon();

    expect(manager.xpMultiplierFor(goalId, at(0, 12))).toBe(1);
  });
});
