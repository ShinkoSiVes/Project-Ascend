import type { DatabaseSync } from 'node:sqlite';
import type { Strictness } from '../../shared/goal';
import {
  PERK_IDS,
  randomSeed,
  xpMultiplier,
  type PerkId,
  type RunState,
  type RunStats,
  type RunSummary
} from '../../shared/run';
import {
  RunError,
  abandonRun,
  advanceRun,
  createRun,
  loseHp,
  pickPerk,
  recordFocus,
  rerollOffers
} from '../../shared/runEngine';
import type { SessionState } from '../../shared/session';
import { isValidId } from '../../shared/todo';
import {
  getRunStats,
  insertRun,
  listRunHistory,
  loadActiveRun,
  loadPendingResult,
  markResultsSeen,
  saveRun
} from '../db/runs';

interface ActiveRun {
  id: number;
  state: RunState;
}

export interface RunManagerOptions {
  // The clock, replaced in tests.
  now?: () => number;
  // The source of random seeds, replaced in tests.
  random?: () => number;
  // Called with every new state of the run, including the one that ends it.
  onChange?: (state: RunState) => void;
}

// Owns the one active run. It applies the pure run engine to the saved state, saves every change,
// and tells the listener whenever the run changes. A run that failed or was won stays on hand,
// as a result to read, until it is dismissed.
export class RunManager {
  private active: ActiveRun | null = null;
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly onChange: (state: RunState) => void;

  constructor(db: DatabaseSync, options: RunManagerOptions = {}) {
    this.db = db;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.onChange = options.onChange ?? (() => {});
  }

  // Loads the active run from the database, without settling any days yet. Call it once at
  // startup, before a crashed session is closed, so that session's focus can still be counted.
  load(): void {
    const stored = loadActiveRun(this.db);
    this.active = stored ? { id: stored.id, state: stored.state } : null;
  }

  // The active run, or else a run that has ended and waits to be read, or null.
  current(): RunState | null {
    this.tick();
    return this.active?.state ?? loadPendingResult(this.db)?.state ?? null;
  }

  // Starts a run for a quest. Only the quest is chosen by the caller; its hours and difficulty
  // are read here, so they cannot be made up.
  start(input: unknown): RunState {
    if (typeof input !== 'object' || input === null) {
      throw new RunError('Invalid run');
    }
    const { goalId } = input as Record<string, unknown>;
    if (!isValidId(goalId)) {
      throw new RunError('Choose a quest for the run');
    }

    this.tick();
    if (this.active) {
      throw new RunError('A run is already active. End it before starting another');
    }

    const goal = this.db
      .prepare('SELECT target_hours, difficulty FROM goals WHERE id = ?')
      .get(goalId) as { target_hours: number; difficulty: number } | undefined;
    if (!goal) {
      throw new RunError('Quest not found');
    }

    const state = createRun(
      {
        goalId,
        targetHours: goal.target_hours,
        difficulty: goal.difficulty,
        seed: randomSeed(this.random)
      },
      this.now()
    );

    // Starting a new run means the last result has been read.
    markResultsSeen(this.db);
    const id = insertRun(this.db, state);
    return this.commit({ id, state });
  }

  // Counts a finished session's focus time toward today's stage, if it was for the run's quest.
  recordSession(session: SessionState): void {
    if (!this.active) {
      return;
    }

    // The focus counts for the day the session ended, which may be earlier than now if it was
    // closed by crash recovery.
    const at = session.endedAt ?? this.now();
    const next = recordFocus(this.active.state, session.goalId, session.focusedMs, at);
    if (next !== this.active.state) {
      this.commit({ id: this.active.id, state: next });
    }
  }

  // A distraction during a session costs the run HP, but only if the session was for the run's
  // quest. With no active run, or a session for another quest, nothing happens.
  loseHp(goalId: number, strictness: Strictness): void {
    if (!this.active || this.active.state.goalId !== goalId) {
      return;
    }

    const next = loseHp(this.active.state, strictness, this.now());
    if (next !== this.active.state) {
      this.commit({ id: this.active.id, state: next });
    }
  }

  // The XP multiplier for a session that ended at a given moment: the run's boost if the session
  // was for the run's quest, otherwise 1. It looks at the run as it stood at that moment, without
  // changing it.
  xpMultiplierFor(goalId: number, at: number): number {
    if (!this.active || this.active.state.goalId !== goalId) {
      return 1;
    }
    return xpMultiplier(advanceRun(this.active.state, at));
  }

  pickPerk(input: unknown): RunState {
    if (typeof input !== 'object' || input === null) {
      throw new RunError('Invalid perk');
    }
    const { perk } = input as Record<string, unknown>;
    if (typeof perk !== 'string' || !PERK_IDS.includes(perk as PerkId)) {
      throw new RunError('Unknown perk');
    }
    return this.apply((state, now) => pickPerk(state, perk as PerkId, now));
  }

  reroll(): RunState {
    return this.apply(rerollOffers);
  }

  abandon(): RunState {
    return this.apply(abandonRun);
  }

  // Marks the result of a finished run as read.
  dismiss(): void {
    markResultsSeen(this.db);
  }

  // Called about once a second. It settles days that have passed, such as at midnight.
  tick(): void {
    if (!this.active) {
      return;
    }

    const next = advanceRun(this.active.state, this.now());
    if (next !== this.active.state) {
      this.commit({ id: this.active.id, state: next });
    }
  }

  history(limit?: number): RunSummary[] {
    return listRunHistory(this.db, limit);
  }

  stats(): RunStats {
    return getRunStats(this.db);
  }

  // Applies one engine transition to the active run. If the engine refuses, nothing is saved.
  private apply(transition: (state: RunState, now: number) => RunState): RunState {
    this.tick();
    if (!this.active) {
      throw new RunError('There is no active run');
    }

    const next = transition(this.active.state, this.now());
    return this.commit({ id: this.active.id, state: next });
  }

  // Saves the new state, keeps it as the active one unless the run ended, and tells the listener.
  private commit(run: ActiveRun): RunState {
    saveRun(this.db, run.id, run.state);
    this.active = run.state.status === 'active' ? run : null;
    this.onChange(run.state);
    return run.state;
  }
}
