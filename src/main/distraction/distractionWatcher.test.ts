import { beforeEach, describe, expect, it } from 'vitest';
import { DISTRACTION_GRACE_SECONDS } from '../../shared/run';
import { DEFAULT_SESSION_CONFIG, MS_PER_MINUTE, type SessionState } from '../../shared/session';
import { createSession, pauseSession, startSession } from '../../shared/sessionEngine';
import { DistractionWatcher } from './distractionWatcher';

const SECOND = 1000;
const START = new Date(2026, 9, 27, 10, 0, 0).getTime();

let time: number;
let front: string | null;
let session: SessionState | null;
let blocklist: string[];
let heard: { app: string; session: SessionState }[];
let reads: number;

function focusSession(): SessionState {
  const state = createSession({
    goalId: 1,
    todoId: null,
    config: { ...DEFAULT_SESSION_CONFIG, strictness: 'gentle' }
  });
  return startSession(state, START);
}

function newWatcher(): DistractionWatcher {
  return new DistractionWatcher({
    now: () => time,
    foregroundApp: () => {
      reads += 1;
      return front;
    },
    blocklist: () => blocklist,
    session: () => session,
    onDistraction: (app, found) => heard.push({ app, session: found })
  });
}

// Moves the clock on and looks once, as the one second ticker does.
function tickAfter(watcher: DistractionWatcher, seconds: number): void {
  time = START + seconds * SECOND;
  watcher.tick();
}

beforeEach(() => {
  time = START;
  front = 'discord';
  session = focusSession();
  blocklist = ['discord', 'steam'];
  heard = [];
  reads = 0;
});

describe('DistractionWatcher', () => {
  it('reports a blocked app once it has stayed in front for the grace period', () => {
    const watcher = newWatcher();

    tickAfter(watcher, 0);
    tickAfter(watcher, DISTRACTION_GRACE_SECONDS - 1);
    expect(heard).toEqual([]);

    tickAfter(watcher, DISTRACTION_GRACE_SECONDS);
    expect(heard).toEqual([{ app: 'discord', session }]);
  });

  it('reports a long stretch only once', () => {
    const watcher = newWatcher();

    for (let seconds = 0; seconds <= 120; seconds++) {
      tickAfter(watcher, seconds);
    }

    expect(heard).toHaveLength(1);
  });

  it('reports again after the person switches away and comes back', () => {
    const watcher = newWatcher();

    tickAfter(watcher, 0);
    tickAfter(watcher, 10);
    front = 'code';
    tickAfter(watcher, 11);
    front = 'discord';
    tickAfter(watcher, 12);
    tickAfter(watcher, 22);

    expect(heard.map((item) => item.app)).toEqual(['discord', 'discord']);
  });

  it('ignores an app that is not on the blocklist', () => {
    front = 'code';
    const watcher = newWatcher();

    tickAfter(watcher, 0);
    tickAfter(watcher, 60);

    expect(heard).toEqual([]);
  });

  it('uses the blocklist as it is now, so an edit counts straight away', () => {
    const watcher = newWatcher();

    tickAfter(watcher, 0);
    blocklist = [];
    tickAfter(watcher, 10);

    expect(heard).toEqual([]);
  });

  it('ignores a front app that cannot be read', () => {
    front = null;
    const watcher = newWatcher();

    tickAfter(watcher, 0);
    tickAfter(watcher, 60);

    expect(heard).toEqual([]);
  });

  it('does nothing and reads nothing when there is no session', () => {
    session = null;
    const watcher = newWatcher();

    tickAfter(watcher, 0);
    tickAfter(watcher, 60);

    expect(heard).toEqual([]);
    expect(reads).toBe(0);
  });

  it('does nothing and reads nothing while the focus clock is stopped', () => {
    session = pauseSession(focusSession(), START + MS_PER_MINUTE);
    const watcher = newWatcher();

    tickAfter(watcher, 120);
    tickAfter(watcher, 180);

    expect(heard).toEqual([]);
    expect(reads).toBe(0);
  });

  it('starts the grace period over when the clock runs again', () => {
    const watcher = newWatcher();

    tickAfter(watcher, 0);
    const running = session;
    session = pauseSession(focusSession(), START + 5 * SECOND);
    tickAfter(watcher, 5);
    session = running;
    tickAfter(watcher, 6);
    tickAfter(watcher, 6 + DISTRACTION_GRACE_SECONDS - 1);
    expect(heard).toEqual([]);

    tickAfter(watcher, 6 + DISTRACTION_GRACE_SECONDS);
    expect(heard).toHaveLength(1);
  });

  it('sees nothing when no reader is given', () => {
    const watcher = new DistractionWatcher({
      now: () => time,
      blocklist: () => blocklist,
      session: () => session,
      onDistraction: (app, found) => heard.push({ app, session: found })
    });

    tickAfter(watcher, 0);
    tickAfter(watcher, 600);

    expect(heard).toEqual([]);
  });
});
