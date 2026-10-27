import type { DatabaseSync } from 'node:sqlite';
import { PetService } from './pet/petService';
import { RunManager } from './run/runManager';
import { SessionManager } from './session/sessionManager';

export interface Services {
  pets: PetService;
  runs: RunManager;
  sessions: SessionManager;
}

export interface ServiceOptions {
  // The clock, replaced in tests.
  now?: () => number;
  // The source of random seeds, replaced in tests.
  random?: () => number;
  // Sends a message to the open windows. Does nothing when left out.
  broadcast?: (channel: string, payload: unknown) => void;
  // How many milliseconds ago the keyboard or mouse was last used. Left out, nobody is ever away.
  idleMs?: () => number;
  // After how many milliseconds without input the person counts as away.
  awayAfterMs?: () => number;
}

// Builds the three services and connects them: when a session ends, it pays the pet and counts
// toward the run. It uses nothing from Electron, so the whole chain can be tested.
export function createServices(db: DatabaseSync, options: ServiceOptions = {}): Services {
  const now = options.now ?? Date.now;
  const broadcast = options.broadcast ?? (() => {});

  const pets = new PetService(db, (update) => broadcast('pet:changed', update));
  const runs = new RunManager(db, {
    now,
    random: options.random,
    onChange: (state) => broadcast('run:changed', state)
  });

  const sessions = new SessionManager(db, {
    now,
    idleMs: options.idleMs,
    awayAfterMs: options.awayAfterMs,
    onChange: (state) => broadcast('session:changed', state),
    onEnded: (id, state) => {
      // The run's XP boost is worked out first, as it stood when the session ended. That way a
      // perk picked because of this very session cannot raise its own pay.
      const endedAt = state.endedAt ?? now();
      pets.awardSession(id, state, runs.xpMultiplierFor(state.goalId, endedAt));
      runs.recordSession(state);
    }
  });

  return { pets, runs, sessions };
}

// Brings the services up to date at startup, in an order that matters:
//   1. load the active run, without settling its days yet;
//   2. close a session left unfinished by a crash, so its focus counts for the day it happened on;
//   3. only then settle the days that passed while the app was closed.
export function recoverServices({ sessions, runs }: Services): void {
  runs.load();
  sessions.recover();
  runs.tick();
}
