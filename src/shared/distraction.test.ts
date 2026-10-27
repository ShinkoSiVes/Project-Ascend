import { describe, expect, it } from 'vitest';
import {
  BLOCKLIST_PRESETS,
  IDLE_WATCH,
  isBlocked,
  isFocusRunning,
  normalizeApp,
  watchForeground,
  type WatchState
} from './distraction';
import { DISTRACTION_GRACE_SECONDS } from './run';
import { DEFAULT_SESSION_CONFIG, MS_PER_MINUTE } from './session';
import { createSession, goAway, pauseSession, startSession } from './sessionEngine';

const SECOND = 1000;
const GRACE = DISTRACTION_GRACE_SECONDS * SECOND;
const START = new Date(2026, 9, 27, 10, 0, 0).getTime();
const blocklist = ['discord', 'Steam.exe'];

// Looks at the front app at each moment in turn and collects what was reported as a distraction.
function look(
  steps: [secondsAfterStart: number, app: string | null, focusRunning?: boolean][],
  from: WatchState = IDLE_WATCH
): { state: WatchState; reported: (string | null)[] } {
  let state = from;
  const reported: (string | null)[] = [];
  for (const [seconds, app, focusRunning = true] of steps) {
    const result = watchForeground(state, app, blocklist, focusRunning, START + seconds * SECOND);
    state = result.state;
    reported.push(result.distraction);
  }
  return { state, reported };
}

function focusSession(): ReturnType<typeof startSession> {
  const state = createSession({
    goalId: 1,
    todoId: null,
    config: { ...DEFAULT_SESSION_CONFIG, strictness: 'gentle' }
  });
  return startSession(state, START);
}

describe('presets', () => {
  it('lists app names that are already in their plain form', () => {
    for (const apps of Object.values(BLOCKLIST_PRESETS)) {
      expect(apps.length).toBeGreaterThan(0);
      for (const app of apps) {
        expect(normalizeApp(app)).toBe(app);
      }
    }
  });

  it('shares no app between two presets', () => {
    const all = Object.values(BLOCKLIST_PRESETS).flat();

    expect(new Set(all).size).toBe(all.length);
  });
});

describe('normalizeApp and isBlocked', () => {
  it.each([
    ['Discord.exe', 'discord'],
    ['  STEAM  ', 'steam'],
    ['steam', 'steam'],
    ['my.exe.exe', 'my.exe'],
    ['', '']
  ])('turns %j into %j', (name, expected) => {
    expect(normalizeApp(name)).toBe(expected);
  });

  it('matches whatever way the name is written, on either side', () => {
    expect(isBlocked('DISCORD.EXE', blocklist)).toBe(true);
    expect(isBlocked('steam', blocklist)).toBe(true);
    expect(isBlocked('code', blocklist)).toBe(false);
  });

  it('matches whole names only', () => {
    expect(isBlocked('discordcanary', blocklist)).toBe(false);
    expect(isBlocked('disc', blocklist)).toBe(false);
  });

  it('never matches nothing, a blank name or an empty list', () => {
    expect(isBlocked(null, blocklist)).toBe(false);
    expect(isBlocked('', ['', ' '])).toBe(false);
    expect(isBlocked('discord', [])).toBe(false);
  });
});

describe('isFocusRunning', () => {
  it('is true while a focus round runs', () => {
    expect(isFocusRunning(focusSession())).toBe(true);
  });

  it('is false while preparing', () => {
    const prep = createSession({ goalId: 1, todoId: null, config: DEFAULT_SESSION_CONFIG });

    expect(isFocusRunning(prep)).toBe(false);
  });

  it('is false while paused', () => {
    expect(isFocusRunning(pauseSession(focusSession(), START + MS_PER_MINUTE))).toBe(false);
  });

  it('is false while away', () => {
    const away = goAway(focusSession(), START + MS_PER_MINUTE, START + 6 * MS_PER_MINUTE);

    expect(isFocusRunning(away)).toBe(false);
  });
});

describe('watchForeground', () => {
  it('reports nothing for an app that is not blocked', () => {
    const { reported, state } = look([
      [0, 'code'],
      [60, 'code']
    ]);

    expect(reported).toEqual([null, null]);
    expect(state).toEqual(IDLE_WATCH);
  });

  it('waits for the grace period before reporting a blocked app', () => {
    const { reported } = look([
      [0, 'discord'],
      [GRACE / SECOND - 1, 'discord'],
      [GRACE / SECOND, 'discord']
    ]);

    expect(reported).toEqual([null, null, 'discord']);
  });

  it('reports the plain name, however the app was written', () => {
    const { reported } = look([
      [0, 'Steam.exe'],
      [10, 'Steam.exe']
    ]);

    expect(reported).toEqual([null, 'steam']);
  });

  it('reports a stretch only once, however long it lasts', () => {
    const { reported } = look([
      [0, 'discord'],
      [10, 'discord'],
      [20, 'discord'],
      [600, 'discord']
    ]);

    expect(reported).toEqual([null, 'discord', null, null]);
  });

  it('forgives a short look: switching away before the grace period costs nothing', () => {
    const { reported } = look([
      [0, 'discord'],
      [9, 'discord'],
      [10, 'code'],
      [11, 'discord'],
      [20, 'discord']
    ]);

    expect(reported).toEqual([null, null, null, null, null]);
  });

  it('starts a new stretch when the person comes back', () => {
    const { reported } = look([
      [0, 'discord'],
      [10, 'discord'],
      [11, 'code'],
      [12, 'discord'],
      [22, 'discord']
    ]);

    expect(reported).toEqual([null, 'discord', null, null, 'discord']);
  });

  it('starts a new stretch when one blocked app is swapped for another', () => {
    const { reported } = look([
      [0, 'discord'],
      [10, 'discord'],
      [11, 'steam'],
      [21, 'steam']
    ]);

    expect(reported).toEqual([null, 'discord', null, 'steam']);
  });

  it('forgets the stretch when the focus clock stops, and starts over when it runs again', () => {
    const { reported } = look([
      [0, 'discord'],
      [8, 'discord', false],
      [9, 'discord'],
      [18, 'discord'],
      [19, 'discord']
    ]);

    expect(reported).toEqual([null, null, null, null, 'discord']);
  });

  it('reports nothing when the front app cannot be read', () => {
    const { reported, state } = look([
      [0, 'discord'],
      [5, null],
      [20, null]
    ]);

    expect(reported).toEqual([null, null, null]);
    expect(state).toEqual(IDLE_WATCH);
  });

  it('does not report when the clock goes backwards', () => {
    const first = watchForeground(IDLE_WATCH, 'discord', blocklist, true, START + 100 * SECOND);
    const back = watchForeground(first.state, 'discord', blocklist, true, START);

    expect(back.distraction).toBeNull();
  });

  it('never changes the state it is given', () => {
    const state = Object.freeze({ app: 'discord', since: START, counted: false });

    const result = watchForeground(state, 'discord', blocklist, true, START + GRACE);

    expect(result.distraction).toBe('discord');
    expect(state.counted).toBe(false);
  });
});
