import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { MS_PER_MINUTE } from '../shared/session';
import { openDatabase } from './db/database';
import { listDistractionCounts } from './db/distractions';
import { createGoal } from './db/goals';
import { createServices, recoverServices, type Services } from './services';

const MIN = MS_PER_MINUTE;

// A moment `days` after 27 October 2026 at the given hour, in local time.
const at = (days: number, hour = 10): number => new Date(2026, 9, 27 + days, hour, 0, 0).getTime();

let db: DatabaseSync;
let goalId: number;
let time: number;
let messages: string[];
let services: Services;
// The app in front, as the reader would report it.
let front: string | null;

function build(): Services {
  return createServices(db, {
    now: () => time,
    random: () => 0.5,
    broadcast: (channel) => messages.push(channel),
    foregroundApp: () => front
  });
}

// A focus session that is running, for a quest, with the given strictness.
function startFocus(forGoal: number, strictness: 'gentle' | 'medium' | 'hard'): void {
  services.sessions.create({
    goalId: forGoal,
    todoId: null,
    config: {
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
      rounds: 1,
      strictness
    }
  });
  services.sessions.start();
}

// Looks at the front app once a second for the given number of seconds, as the ticker does.
function watchFor(seconds: number): void {
  for (let i = 0; i <= seconds; i++) {
    services.watcher.tick();
    time += 1000;
  }
}

// A session for a quest with one round of the given length, run to its natural end.
function runSession(forGoal: number, focusMinutes: number): void {
  services.sessions.create({
    goalId: forGoal,
    todoId: null,
    config: {
      focusMinutes,
      breakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
      rounds: 1,
      strictness: 'gentle'
    }
  });
  services.sessions.start();
  time += focusMinutes * MIN;
  services.sessions.tick();
}

function boostRun(percent: number): void {
  db.prepare("UPDATE runs SET state = json_set(state, '$.xpBoostPercent', ?)").run(percent);
  services.runs.load();
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
  messages = [];
  front = null;
  services = build();
  services.pets.choose({ species: 'ember', name: 'Bean' });
});

describe('a finished session', () => {
  it('pays the pet and counts toward the run quota', () => {
    services.runs.start({ goalId });

    // The first stage asks for 30 minutes. A completed 30 minute session pays 30 + 50 XP.
    runSession(goalId, 30);

    expect(services.pets.get()?.xp).toBe(80);
    const run = services.runs.current()!;
    expect(run.focusedMs).toBe(30 * MIN);
    expect(run.cleared).toBe(true);
    expect(run.offers).toHaveLength(3);
  });

  it('pays the pet but does not touch the run when there is no run', () => {
    runSession(goalId, 30);

    expect(services.pets.get()?.xp).toBe(80);
    expect(services.runs.current()).toBeNull();
  });

  it('counts a session for another quest toward nothing in the run, and does not boost it', () => {
    const other = createGoal(db, {
      title: 'Other',
      targetHours: 5,
      difficulty: 1,
      strictness: 'gentle'
    });
    services.runs.start({ goalId });
    boostRun(100);

    runSession(other.id, 30);

    expect(services.pets.get()?.xp).toBe(80);
    expect(services.runs.current()?.focusedMs).toBe(0);
  });

  it('tells the windows about the session, the pet and the run', () => {
    services.runs.start({ goalId });
    messages = [];

    runSession(goalId, 30);

    expect(new Set(messages)).toEqual(new Set(['session:changed', 'pet:changed', 'run:changed']));
  });
});

describe('a distraction', () => {
  it('costs the run HP and is counted, after the grace period', () => {
    services.runs.start({ goalId });
    startFocus(goalId, 'medium');
    front = 'Discord.exe';

    watchFor(9);
    expect(services.runs.current()?.hp).toBe(100);

    watchFor(2);
    expect(services.runs.current()?.hp).toBe(90);
    expect(listDistractionCounts(db)).toEqual([{ app: 'discord', count: 1 }]);
  });

  it('costs HP once for one long stretch', () => {
    services.runs.start({ goalId });
    startFocus(goalId, 'medium');
    front = 'discord';

    watchFor(120);

    expect(services.runs.current()?.hp).toBe(90);
    expect(listDistractionCounts(db)).toEqual([{ app: 'discord', count: 1 }]);
  });

  it('is counted but costs no HP when there is no run', () => {
    startFocus(goalId, 'medium');
    front = 'steam';

    watchFor(11);

    expect(services.runs.current()).toBeNull();
    expect(listDistractionCounts(db)).toEqual([{ app: 'steam', count: 1 }]);
  });

  it('is counted but costs the run no HP when the session is for another quest', () => {
    const other = createGoal(db, {
      title: 'Other',
      targetHours: 5,
      difficulty: 1,
      strictness: 'gentle'
    });
    services.runs.start({ goalId });
    startFocus(other.id, 'medium');
    front = 'discord';

    watchFor(11);

    expect(services.runs.current()?.hp).toBe(100);
    expect(listDistractionCounts(db)).toEqual([{ app: 'discord', count: 1 }]);
  });

  it('is not seen when the app in front is not on the blocklist', () => {
    services.runs.start({ goalId });
    startFocus(goalId, 'medium');
    front = 'code';

    watchFor(60);

    expect(services.runs.current()?.hp).toBe(100);
    expect(listDistractionCounts(db)).toEqual([]);
  });

  it('is not seen when no session is running', () => {
    services.runs.start({ goalId });
    front = 'discord';

    watchFor(60);

    expect(services.runs.current()?.hp).toBe(100);
    expect(listDistractionCounts(db)).toEqual([]);
  });

  it('is not seen while the focus clock is paused', () => {
    services.runs.start({ goalId });
    startFocus(goalId, 'gentle');
    services.sessions.pause();
    front = 'discord';

    watchFor(60);

    expect(services.runs.current()?.hp).toBe(100);
  });

  it('fails the run at 0 HP when the session is on medium', () => {
    services.runs.start({ goalId });
    startFocus(goalId, 'medium');
    db.prepare("UPDATE runs SET state = json_set(state, '$.hp', 10)").run();
    services.runs.load();
    front = 'discord';

    watchFor(11);

    expect(services.runs.current()).toMatchObject({ status: 'failed', failReason: 'hp' });
  });

  it('tells the windows about the new HP', () => {
    services.runs.start({ goalId });
    startFocus(goalId, 'medium');
    front = 'discord';
    messages = [];

    watchFor(11);

    expect(messages).toContain('run:changed');
  });
});

describe('the XP boost', () => {
  it('multiplies session XP for the run quest', () => {
    services.runs.start({ goalId });
    boostRun(100);

    runSession(goalId, 30);

    expect(services.pets.get()?.xp).toBe(160);
  });

  it('rounds the boosted XP to a whole number', () => {
    services.runs.start({ goalId });
    boostRun(25);

    runSession(goalId, 33);

    // 33 + 50 = 83 XP, times 1.25 = 103.75, rounded to 104.
    expect(services.pets.get()?.xp).toBe(104);
  });

  it('does not raise the pay of the very session that earned the perk', () => {
    services.runs.start({ goalId });
    runSession(goalId, 30);
    expect(services.runs.current()?.cleared).toBe(true);
    // Only three of the four perks are offered at random, so the offer is set by hand here.
    db.prepare(
      `UPDATE runs SET state = json_set(state, '$.offers', json('["xpBoost","shield","reroll"]'))`
    ).run();
    services.runs.load();
    services.runs.pickPerk({ perk: 'xpBoost' });
    expect(services.pets.get()?.xp).toBe(80);

    // The next day's session gets the boost.
    time = at(1, 10);
    runSession(goalId, 35);

    // 35 + 50 = 85, times 1.25 = 106.25, rounded to 106.
    expect(services.pets.get()?.xp).toBe(80 + 106);
  });

  it('stops once the run is over', () => {
    services.runs.start({ goalId });
    boostRun(100);
    services.runs.abandon();

    runSession(goalId, 30);

    expect(services.pets.get()?.xp).toBe(80);
  });
});

describe('starting up after a crash', () => {
  // The first stage is on day 0. A 60 minute session is started and runs for 40 minutes, longer
  // than the 30 minute quota, and then the app is killed.
  function crashDuringSession(): void {
    services.runs.start({ goalId });
    services.sessions.create({
      goalId,
      todoId: null,
      config: {
        focusMinutes: 60,
        breakMinutes: 5,
        longBreakMinutes: 15,
        longBreakEvery: 4,
        rounds: 1,
        strictness: 'gentle'
      }
    });
    services.sessions.start();
    time = at(0, 10) + 40 * MIN;
    services.sessions.tick();
  }

  it('counts the focus done before the crash toward the day it happened, even days later', () => {
    crashDuringSession();

    // Three days later a new app starts on the same data.
    time = at(3, 9);
    const relaunched = build();
    recoverServices(relaunched);

    const run = relaunched.runs.current()!;
    // Day 0 was cleared by the 40 focused minutes, and then day 1 was missed.
    expect(run).toMatchObject({ status: 'failed', stageIndex: 2, endDay: '2026-10-28' });
    expect(run.results).toEqual(['cleared']);
    // The crashed session paid its 40 whole minutes to the pet.
    expect(relaunched.pets.get()?.xp).toBe(40);
  });

  it('would have failed on the first stage if the days had been settled before the session', () => {
    crashDuringSession();
    time = at(3, 9);
    const relaunched = build();

    // The wrong order, to show why recoverServices does it the way it does.
    relaunched.runs.load();
    relaunched.runs.tick();
    relaunched.sessions.recover();

    expect(relaunched.runs.current()).toMatchObject({ status: 'failed', stageIndex: 1 });
  });

  it('starts cleanly with nothing to recover', () => {
    expect(() => recoverServices(build())).not.toThrow();
  });

  it('keeps an unfinished run and its progress when the app was only closed for a night', () => {
    services.runs.start({ goalId });
    runSession(goalId, 30);

    time = at(1, 9);
    const relaunched = build();
    recoverServices(relaunched);

    expect(relaunched.runs.current()).toMatchObject({
      status: 'active',
      stageIndex: 2,
      results: ['cleared']
    });
  });
});
