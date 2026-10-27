import type { DatabaseSync } from 'node:sqlite';
import {
  MAX_HP,
  PERK_IDS,
  stageReached,
  stagesCleared,
  type RunState,
  type RunStats,
  type RunStatus,
  type RunSummary
} from '../../shared/run';
import { isValidId } from '../../shared/todo';

// A run row as the app uses it: the saved state and the row it lives in.
export interface StoredRun {
  id: number;
  state: RunState;
}

const STATUSES: readonly string[] = ['active', 'failed', 'completed', 'abandoned'];
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Parses saved JSON, returning null instead of throwing when the text is damaged.
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isWholeNumber(value: unknown, min: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

function isPerkList(value: unknown): boolean {
  return Array.isArray(value) && value.every((perk) => PERK_IDS.includes(perk));
}

// Guards against a damaged row: the saved JSON must have the shape the engine expects.
function isRunState(value: unknown): value is RunState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const run = value as Record<string, unknown>;
  const stages = run.stages;

  return (
    isValidId(run.goalId) &&
    isWholeNumber(run.seed, 0) &&
    typeof run.startDay === 'string' &&
    DAY_PATTERN.test(run.startDay) &&
    Array.isArray(stages) &&
    stages.length >= 1 &&
    stages.every(
      (stage) =>
        typeof stage === 'object' &&
        stage !== null &&
        isWholeNumber(stage.index, 1) &&
        ['normal', 'rest', 'boss'].includes(stage.kind) &&
        isWholeNumber(stage.quotaMinutes, 1)
    ) &&
    isWholeNumber(run.stageIndex, 1) &&
    (run.stageIndex as number) <= stages.length &&
    isWholeNumber(run.quotaMinutes, 1) &&
    typeof run.focusedMs === 'number' &&
    Number.isFinite(run.focusedMs) &&
    typeof run.cleared === 'boolean' &&
    Array.isArray(run.results) &&
    run.results.every((result) => result === 'cleared' || result === 'forgiven') &&
    STATUSES.includes(run.status as string) &&
    (run.endDay === null || (typeof run.endDay === 'string' && DAY_PATTERN.test(run.endDay))) &&
    (run.offers === null || isPerkList(run.offers)) &&
    isWholeNumber(run.redraws, 0) &&
    isWholeNumber(run.shields, 0) &&
    isWholeNumber(run.rerolls, 0) &&
    isWholeNumber(run.xpBoostPercent, 0) &&
    typeof run.lighterNext === 'boolean' &&
    isPerkList(run.perks) &&
    isWholeNumber(run.hp, 0) &&
    (run.hp as number) <= MAX_HP &&
    isWholeNumber(run.revivesUsed, 0) &&
    (run.failReason === null || run.failReason === 'quota' || run.failReason === 'hp')
  );
}

// A run saved before HP existed has no HP fields. Give it full HP and no failure reason, so an
// update never throws away a run that was in progress. A failed run keeps the reason it must have
// had: HP did not exist, so its quota was missed.
function withHpDefaults(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const run = value as Record<string, unknown>;
  return {
    ...run,
    hp: run.hp ?? MAX_HP,
    revivesUsed: run.revivesUsed ?? 0,
    failReason: run.failReason ?? (run.status === 'failed' ? 'quota' : null)
  };
}

// A run that has failed or been won waits to be read. One that is active, or that the person
// ended themselves, has nothing to show.
function needsReading(status: RunStatus): boolean {
  return status === 'failed' || status === 'completed';
}

// Saves a new run and returns its id. Fails if another run is still active.
export function insertRun(db: DatabaseSync, state: RunState): number {
  const row = db
    .prepare(
      `INSERT INTO runs
         (goal_id, state, status, seed, stages_total, stage_reached, stages_cleared, start_day, end_day, seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       RETURNING id`
    )
    .get(
      state.goalId,
      JSON.stringify(state),
      state.status,
      state.seed,
      state.stages.length,
      stageReached(state),
      stagesCleared(state),
      state.startDay,
      state.endDay
    ) as { id: number };
  return row.id;
}

// Saves a changed state. The columns next to the JSON are copies kept for queries.
export function saveRun(db: DatabaseSync, id: number, state: RunState): void {
  db.prepare(
    `UPDATE runs
     SET state = ?, status = ?, stage_reached = ?, stages_cleared = ?, end_day = ?, seen = ?
     WHERE id = ?`
  ).run(
    JSON.stringify(state),
    state.status,
    stageReached(state),
    stagesCleared(state),
    state.endDay,
    needsReading(state.status) ? 0 : 1,
    id
  );
}

// Reads a row's state, closing the row if it is damaged so it cannot block new runs.
function readState(db: DatabaseSync, row: { id: number; state: string }): StoredRun | null {
  const parsed = withHpDefaults(parseJson(row.state));
  if (!isRunState(parsed)) {
    db.prepare("UPDATE runs SET status = 'abandoned', seen = 1 WHERE id = ?").run(row.id);
    return null;
  }
  return { id: row.id, state: parsed };
}

// The active run, if there is one.
export function loadActiveRun(db: DatabaseSync): StoredRun | null {
  const row = db.prepare("SELECT id, state FROM runs WHERE status = 'active'").get() as unknown as
    { id: number; state: string } | undefined;
  return row ? readState(db, row) : null;
}

// The latest run that failed or was won and has not been read yet, if there is one.
export function loadPendingResult(db: DatabaseSync): StoredRun | null {
  const row = db
    .prepare(
      "SELECT id, state FROM runs WHERE status <> 'active' AND seen = 0 ORDER BY id DESC LIMIT 1"
    )
    .get() as unknown as { id: number; state: string } | undefined;
  return row ? readState(db, row) : null;
}

// Marks every finished run as read.
export function markResultsSeen(db: DatabaseSync): void {
  db.prepare('UPDATE runs SET seen = 1 WHERE seen = 0').run();
}

interface SummaryRow {
  id: number;
  goal_id: number;
  title: string;
  start_day: string;
  end_day: string | null;
  status: string;
  stages_total: number;
  stage_reached: number;
  stages_cleared: number;
}

// The finished runs, newest first.
export function listRunHistory(db: DatabaseSync, limit = 20): RunSummary[] {
  const rows = db
    .prepare(
      `SELECT runs.id, runs.goal_id, goals.title, runs.start_day, runs.end_day, runs.status,
              runs.stages_total, runs.stage_reached, runs.stages_cleared
       FROM runs JOIN goals ON goals.id = runs.goal_id
       WHERE runs.status <> 'active'
       ORDER BY runs.id DESC
       LIMIT ?`
    )
    .all(Math.max(1, Math.floor(limit))) as unknown as SummaryRow[];

  return rows.map((row) => ({
    id: row.id,
    goalId: row.goal_id,
    goalTitle: row.title,
    startDay: row.start_day,
    endDay: row.end_day,
    status: row.status as RunStatus,
    stagesTotal: row.stages_total,
    stageReached: row.stage_reached,
    stagesCleared: row.stages_cleared
  }));
}

// Lifetime numbers. They survive every run, because they are read from what was saved.
export function getRunStats(db: DatabaseSync): RunStats {
  const runs = db
    .prepare(
      `SELECT COALESCE(MAX(stage_reached), 0) AS best,
              COALESCE(SUM(status <> 'active'), 0) AS played,
              COALESCE(SUM(status = 'completed'), 0) AS won
       FROM runs`
    )
    .get() as { best: number; played: number; won: number };
  const focus = db
    .prepare("SELECT COALESCE(SUM(focused_ms), 0) AS total FROM sessions WHERE phase = 'ended'")
    .get() as { total: number };

  return {
    bestStage: runs.best,
    runsPlayed: runs.played,
    runsWon: runs.won,
    totalFocusMs: focus.total
  };
}
