import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RunState } from '../../shared/run';
import { abandonRun, advanceRun, createRun, recordFocus } from '../../shared/runEngine';
import { DEFAULT_SESSION_CONFIG } from '../../shared/session';
import { createSession, startSession, abandonSession } from '../../shared/sessionEngine';
import { openDatabase } from './database';
import { createGoal } from './goals';
import {
  getRunStats,
  insertRun,
  listRunHistory,
  loadActiveRun,
  loadPendingResult,
  markResultsSeen,
  saveRun
} from './runs';
import { insertSession, saveSession } from './sessions';

const MIN = 60_000;
// A moment `days` after 27 October 2026 at 10:00 local time.
const d = (days: number): number => new Date(2026, 9, 27 + days, 10, 0, 0).getTime();

let db: DatabaseSync;
let goalId: number;

function newRun(
  overrides: Partial<RunState> = {},
  plan = { targetHours: 10, difficulty: 2 }
): RunState {
  return { ...createRun({ goalId, seed: 3, ...plan }, d(0)), ...overrides };
}

function rawStatus(id: number): { status: string; seen: number } {
  return db.prepare('SELECT status, seen FROM runs WHERE id = ?').get(id) as {
    status: string;
    seen: number;
  };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  goalId = createGoal(db, {
    title: 'Study',
    targetHours: 10,
    difficulty: 2,
    strictness: 'gentle'
  }).id;
});

describe('insertRun and loadActiveRun', () => {
  it('saves a run and loads it back exactly', () => {
    const run = newRun();
    const id = insertRun(db, run);

    expect(loadActiveRun(db)).toEqual({ id, state: run });
  });

  it('returns null when no run is active', () => {
    expect(loadActiveRun(db)).toBeNull();
  });

  it('allows only one active run at a time', () => {
    insertRun(db, newRun());

    expect(() => insertRun(db, newRun())).toThrow();
  });

  it('allows a new run once the old one ended', () => {
    const run = newRun();
    const id = insertRun(db, run);
    saveRun(db, id, abandonRun(run, d(0)));

    expect(loadActiveRun(db)).toBeNull();
    expect(() => insertRun(db, newRun())).not.toThrow();
  });

  it('rejects a run for a goal that does not exist', () => {
    expect(() => insertRun(db, newRun({ goalId: 9999 }))).toThrow();
  });

  it('is removed together with its goal', () => {
    insertRun(db, newRun());

    db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);

    expect((db.prepare('SELECT COUNT(*) AS n FROM runs').get() as { n: number }).n).toBe(0);
  });
});

describe('saveRun', () => {
  it('updates the state and the columns kept for queries', () => {
    const run = newRun();
    const id = insertRun(db, run);
    const cleared = recordFocus(run, goalId, run.quotaMinutes * MIN, d(0));

    saveRun(db, id, cleared);

    const row = db
      .prepare(
        'SELECT status, stage_reached, stages_cleared, stages_total, seed, start_day FROM runs WHERE id = ?'
      )
      .get(id) as Record<string, unknown>;
    expect(row).toEqual({
      status: 'active',
      stage_reached: 1,
      stages_cleared: 1,
      stages_total: run.stages.length,
      seed: 3,
      start_day: '2026-10-27'
    });
    expect(loadActiveRun(db)?.state).toEqual(cleared);
  });

  it('leaves a failed run waiting to be read', () => {
    const run = newRun();
    const id = insertRun(db, run);
    const failed = advanceRun(run, d(1));

    saveRun(db, id, failed);

    expect(failed.status).toBe('failed');
    expect(rawStatus(id)).toEqual({ status: 'failed', seen: 0 });
    expect(loadPendingResult(db)).toEqual({ id, state: failed });
    expect(loadActiveRun(db)).toBeNull();
  });

  it('leaves a won run waiting to be read', () => {
    const run = newRun({}, { targetHours: 0.5, difficulty: 1 });
    const id = insertRun(db, run);
    const won = advanceRun({ ...run, shields: 3 }, d(10));

    saveRun(db, id, won);

    expect(won.status).toBe('completed');
    expect(rawStatus(id)).toEqual({ status: 'completed', seen: 0 });
  });

  it('does not make a run the person ended themselves wait to be read', () => {
    const run = newRun();
    const id = insertRun(db, run);

    saveRun(db, id, abandonRun(run, d(0)));

    expect(rawStatus(id)).toEqual({ status: 'abandoned', seen: 1 });
    expect(loadPendingResult(db)).toBeNull();
  });
});

describe('results waiting to be read', () => {
  function endRun(): number {
    const run = newRun();
    const id = insertRun(db, run);
    saveRun(db, id, advanceRun(run, d(1)));
    return id;
  }

  it('shows the latest unread result, and nothing once read', () => {
    const id = endRun();
    expect(loadPendingResult(db)?.id).toBe(id);

    markResultsSeen(db);

    expect(loadPendingResult(db)).toBeNull();
    expect(rawStatus(id).seen).toBe(1);
  });

  it('shows the newest result when several were never read', () => {
    endRun();
    const second = endRun();

    expect(loadPendingResult(db)?.id).toBe(second);
  });
});

describe('damaged rows', () => {
  function insertRaw(stateText: string, status = 'active', seen = 1): number {
    const row = db
      .prepare(
        `INSERT INTO runs (goal_id, state, status, seed, stages_total, stage_reached, start_day, seen)
         VALUES (?, ?, ?, 1, 3, 1, '2026-10-27', ?) RETURNING id`
      )
      .get(goalId, stateText, status, seen) as { id: number };
    return row.id;
  }

  const good = (): RunState => newRun();
  const broken: [string, () => string][] = [
    ['text that is not JSON', () => 'not json'],
    ['JSON of the wrong type', () => '"hello"'],
    ['null', () => 'null'],
    ['an object missing fields', () => '{"goalId":1}'],
    ['a bad status', () => JSON.stringify({ ...good(), status: 'dancing' })],
    ['no stages', () => JSON.stringify({ ...good(), stages: [] })],
    ['a stage index past the end', () => JSON.stringify({ ...good(), stageIndex: 99 })],
    ['a malformed start day', () => JSON.stringify({ ...good(), startDay: 'yesterday' })],
    ['an unknown perk', () => JSON.stringify({ ...good(), perks: ['cheat'] })],
    ['a bad offer', () => JSON.stringify({ ...good(), offers: ['shield', 'nope', 'reroll'] })],
    ['a bad result', () => JSON.stringify({ ...good(), results: ['won'] })],
    ['HP above the maximum', () => JSON.stringify({ ...good(), hp: 101 })],
    ['negative HP', () => JSON.stringify({ ...good(), hp: -1 })],
    ['a fractional HP', () => JSON.stringify({ ...good(), hp: 50.5 })],
    ['a bad revive count', () => JSON.stringify({ ...good(), revivesUsed: -1 })],
    ['an unknown fail reason', () => JSON.stringify({ ...good(), failReason: 'boredom' })]
  ];

  it.each(broken)(
    'closes an active row holding %s so it cannot block new runs',
    (_name, makeText) => {
      const id = insertRaw(makeText());

      expect(loadActiveRun(db)).toBeNull();

      expect(rawStatus(id)).toEqual({ status: 'abandoned', seen: 1 });
      expect(() => insertRun(db, newRun())).not.toThrow();
    }
  );

  // A run saved before HP existed has none of the three HP fields.
  function withoutHpFields(run: RunState): string {
    const old: Record<string, unknown> = { ...run };
    delete old.hp;
    delete old.revivesUsed;
    delete old.failReason;
    return JSON.stringify(old);
  }

  it('loads a run saved before HP existed, at full HP', () => {
    const run = newRun({ stageIndex: 2 });
    const id = insertRaw(withoutHpFields(run));

    expect(loadActiveRun(db)).toEqual({ id, state: run });
    expect(rawStatus(id).status).toBe('active');
  });

  it('gives a failed run from before HP the reason it must have had', () => {
    const failed: RunState = {
      ...newRun(),
      status: 'failed',
      failReason: 'quota',
      endDay: '2026-10-27'
    };
    const id = insertRaw(withoutHpFields(failed), 'failed', 0);

    expect(loadPendingResult(db)).toEqual({ id, state: failed });
  });

  it('closes a damaged unread result instead of showing it', () => {
    const id = insertRaw('garbage', 'failed', 0);

    expect(loadPendingResult(db)).toBeNull();
    expect(rawStatus(id).seen).toBe(1);
  });
});

describe('history and stats', () => {
  function finish(run: RunState, finalState: RunState): void {
    const id = insertRun(db, run);
    saveRun(db, id, finalState);
  }

  it('starts empty', () => {
    expect(listRunHistory(db)).toEqual([]);
    expect(getRunStats(db)).toEqual({ bestStage: 0, runsPlayed: 0, runsWon: 0, totalFocusMs: 0 });
  });

  it('lists finished runs newest first, with the quest title', () => {
    const first = newRun();
    finish(first, advanceRun(first, d(1)));
    const second = newRun({ seed: 4 });
    finish(second, abandonRun(second, d(0)));

    const history = listRunHistory(db);

    expect(history.map((run) => run.status)).toEqual(['abandoned', 'failed']);
    expect(history[0]).toMatchObject({
      goalId,
      goalTitle: 'Study',
      startDay: '2026-10-27',
      stagesTotal: first.stages.length,
      stageReached: 1,
      stagesCleared: 0
    });
  });

  it('leaves an active run out of the history', () => {
    insertRun(db, newRun());

    expect(listRunHistory(db)).toEqual([]);
  });

  it('respects the limit', () => {
    for (let i = 0; i < 5; i++) {
      const run = newRun({ seed: i });
      finish(run, abandonRun(run, d(0)));
    }

    expect(listRunHistory(db, 3)).toHaveLength(3);
    expect(listRunHistory(db, 0)).toHaveLength(1);
  });

  it('counts the best stage, runs played and runs won', () => {
    // A run that failed on stage 3 after clearing two days.
    let failed = newRun();
    for (let day = 0; day < 2; day++) {
      // 600 minutes is far more than any stage asks, so each of the first two days is cleared.
      failed = recordFocus(advanceRun(failed, d(day)), goalId, 600 * MIN, d(day));
    }
    failed = advanceRun(failed, d(4));
    expect(failed).toMatchObject({ status: 'failed', stageIndex: 3 });
    finish(newRun(), failed);

    // A run that was won.
    const small = newRun({}, { targetHours: 0.5, difficulty: 1 });
    finish(small, advanceRun({ ...small, shields: 3 }, d(10)));

    // A run that is still going.
    insertRun(db, newRun());

    expect(getRunStats(db)).toMatchObject({ bestStage: 3, runsPlayed: 2, runsWon: 1 });
  });

  it('adds up the focus time of finished sessions only', () => {
    const base = createSession({ goalId, todoId: null, config: DEFAULT_SESSION_CONFIG });
    const first = startSession(base, d(0));
    const firstId = insertSession(db, first, d(0));
    saveSession(db, firstId, abandonSession(first, d(0) + 10 * MIN), d(0));

    const second = startSession(base, d(1));
    const secondId = insertSession(db, second, d(1));
    saveSession(db, secondId, abandonSession(second, d(1) + 5 * MIN), d(1));
    const third = startSession(base, d(2));
    insertSession(db, third, d(2));

    expect(getRunStats(db).totalFocusMs).toBe(15 * MIN);
  });

  it('keeps every number after the active run ends', () => {
    const run = newRun();
    const id = insertRun(db, run);
    saveRun(db, id, advanceRun(run, d(1)));
    const before = getRunStats(db);

    insertRun(db, newRun({ seed: 9 }));

    expect(getRunStats(db)).toMatchObject({ bestStage: before.bestStage, runsPlayed: 1 });
  });
});
