import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_CONFIG,
  MS_PER_MINUTE,
  awayMsSoFar,
  focusedMsSoFar,
  isAway,
  isPaused,
  pausesLeft,
  phaseDurationMs,
  remainingMs,
  type SessionConfig,
  type SessionState
} from './session';
import {
  SessionError,
  abandonSession,
  advance,
  comeBack,
  createSession,
  goAway,
  pauseSession,
  resumeSession,
  startSession
} from './sessionEngine';

const T0 = 1_700_000_000_000;
const MIN = MS_PER_MINUTE;

// A moment in time, in minutes after the session started.
const at = (minutes: number): number => T0 + minutes * MIN;

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return { ...DEFAULT_SESSION_CONFIG, ...overrides };
}

function prepared(overrides: Partial<SessionConfig> = {}): SessionState {
  return createSession({ goalId: 1, todoId: null, config: config(overrides) });
}

// A session whose first focus round starts at T0.
function started(overrides: Partial<SessionConfig> = {}): SessionState {
  return startSession(prepared(overrides), T0);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('createSession', () => {
  it('builds a session in the prep phase', () => {
    const state = prepared();

    expect(state).toMatchObject({
      goalId: 1,
      todoId: null,
      phase: 'prep',
      round: 0,
      pausedAt: null,
      pausesUsed: 0,
      focusedMs: 0,
      startedAt: null,
      endedAt: null,
      endReason: null
    });
    expect(state.config).toEqual(DEFAULT_SESSION_CONFIG);
  });

  it('keeps the chosen task', () => {
    const state = createSession({ goalId: 4, todoId: 9, config: config() });

    expect(state.goalId).toBe(4);
    expect(state.todoId).toBe(9);
  });

  it('drops settings it does not know', () => {
    const state = createSession({ goalId: 1, todoId: null, config: { ...config(), evil: true } });

    expect(state.config).toEqual(DEFAULT_SESSION_CONFIG);
    expect('evil' in state.config).toBe(false);
  });

  it('accepts the limits exactly', () => {
    expect(() =>
      prepared({
        focusMinutes: 1,
        breakMinutes: 1,
        longBreakMinutes: 1,
        longBreakEvery: 2,
        rounds: 1
      })
    ).not.toThrow();
    expect(() =>
      prepared({
        focusMinutes: 180,
        breakMinutes: 60,
        longBreakMinutes: 120,
        longBreakEvery: 12,
        rounds: 12
      })
    ).not.toThrow();
  });

  it.each([
    ['null', null],
    ['text', 'session'],
    ['a missing goal', { todoId: null, config: config() }],
    ['a goal id of 0', { goalId: 0, todoId: null, config: config() }],
    ['a task id as text', { goalId: 1, todoId: '2', config: config() }],
    ['a task id of 0', { goalId: 1, todoId: 0, config: config() }],
    ['a missing task field', { goalId: 1, config: config() }],
    ['missing settings', { goalId: 1, todoId: null }],
    ['null settings', { goalId: 1, todoId: null, config: null }]
  ])('rejects %s', (_name, input) => {
    expect(() => createSession(input)).toThrow(SessionError);
  });

  it.each([
    ['focus of 0 minutes', { focusMinutes: 0 }],
    ['focus over 180 minutes', { focusMinutes: 181 }],
    ['a fractional focus', { focusMinutes: 25.5 }],
    ['a break of 0 minutes', { breakMinutes: 0 }],
    ['a break over 60 minutes', { breakMinutes: 61 }],
    ['a long break over 120 minutes', { longBreakMinutes: 121 }],
    ['a long break interval of 1', { longBreakEvery: 1 }],
    ['a long break interval over 12', { longBreakEvery: 13 }],
    ['0 rounds', { rounds: 0 }],
    ['over 12 rounds', { rounds: 13 }],
    ['an unknown strictness', { strictness: 'extreme' as never }],
    ['text for a length', { focusMinutes: '25' as never }]
  ])('rejects %s', (_name, overrides) => {
    expect(() => prepared(overrides)).toThrow(SessionError);
  });
});

describe('startSession', () => {
  it('starts the first focus round with the full time left', () => {
    const state = started();

    expect(state).toMatchObject({ phase: 'focus', round: 1, startedAt: T0, segmentStartedAt: T0 });
    expect(remainingMs(state, T0)).toBe(25 * MIN);
  });

  it('cannot be started twice', () => {
    expect(() => startSession(started(), at(1))).toThrow('already started');
  });
});

describe('advance', () => {
  it('changes nothing before the phase is due', () => {
    const state = started();

    expect(advance(state, at(10))).toEqual(state);
    expect(advance(state, at(24.99))).toEqual(state);
  });

  it('moves from focus to a short break exactly when the round is due', () => {
    const state = advance(started(), at(25));

    expect(state).toMatchObject({
      phase: 'break',
      round: 1,
      segmentStartedAt: at(25),
      focusedMs: 25 * MIN
    });
    expect(phaseDurationMs(state)).toBe(5 * MIN);
  });

  it('moves from a break to the next focus round', () => {
    const state = advance(started(), at(30));

    expect(state).toMatchObject({ phase: 'focus', round: 2, segmentStartedAt: at(30) });
    expect(remainingMs(state, at(30))).toBe(25 * MIN);
  });

  it('uses the long break after every 4th round', () => {
    // 4 focus rounds and 3 short breaks take 115 minutes, so the 4th break starts at 115.
    const state = advance(started({ rounds: 8 }), at(115));

    expect(state).toMatchObject({ phase: 'break', round: 4 });
    expect(phaseDurationMs(state)).toBe(15 * MIN);
  });

  it('respects a custom long break interval', () => {
    const state = advance(started({ rounds: 8, longBreakEvery: 2 }), at(55));

    expect(state).toMatchObject({ phase: 'break', round: 2 });
    expect(phaseDurationMs(state)).toBe(15 * MIN);
  });

  it('ends the session after the last round, with no break after it', () => {
    const state = advance(started({ rounds: 2 }), at(55));

    expect(state).toMatchObject({
      phase: 'ended',
      endReason: 'completed',
      endedAt: at(55),
      focusedMs: 50 * MIN,
      segmentStartedAt: null
    });
  });

  it('ends a single-round session when the round is due', () => {
    const state = advance(started({ rounds: 1 }), at(25));

    expect(state).toMatchObject({ phase: 'ended', endReason: 'completed', focusedMs: 25 * MIN });
  });

  it('catches up after a long sleep, ending each phase at its scheduled time', () => {
    // 8 rounds: 8 x 25 focus + 3 short + 1 long + 3 short breaks = 245 minutes.
    const state = advance(started({ rounds: 8 }), at(10 * 60));

    expect(state).toMatchObject({
      phase: 'ended',
      endReason: 'completed',
      endedAt: at(245),
      focusedMs: 200 * MIN
    });
  });

  it('catches up into the middle of a later phase', () => {
    // Round 3 starts at minute 60, so minute 62 is two minutes into it.
    const state = advance(started(), at(62));

    expect(state).toMatchObject({ phase: 'focus', round: 3, focusedMs: 50 * MIN });
    expect(remainingMs(state, at(62))).toBe(23 * MIN);
  });

  it('gives the same result when called twice or in steps', () => {
    const once = advance(started(), at(62));

    expect(advance(once, at(62))).toEqual(once);
    expect(advance(advance(started(), at(30)), at(62))).toEqual(once);
  });

  it('leaves preparing and ended sessions alone', () => {
    const prep = prepared();
    const ended = abandonSession(started(), at(5));

    expect(advance(prep, at(500))).toEqual(prep);
    expect(advance(ended, at(500))).toEqual(ended);
  });

  it('never counts time backwards when the clock moves back', () => {
    const state = started();

    expect(advance(state, at(-5))).toEqual(state);
    expect(remainingMs(state, at(-5))).toBe(25 * MIN);
  });
});

describe('pausing', () => {
  it('stops the clock and gives it back on resume', () => {
    // Gentle has no pause time limit, so a 10 minute pause stays a pause.
    const paused = pauseSession(started({ strictness: 'gentle' }), at(10));

    expect(isPaused(paused)).toBe(true);
    expect(remainingMs(paused, at(10))).toBe(15 * MIN);
    expect(remainingMs(paused, at(20))).toBe(15 * MIN);

    const resumed = resumeSession(paused, at(20));

    expect(isPaused(resumed)).toBe(false);
    expect(remainingMs(resumed, at(25))).toBe(10 * MIN);
    expect(advance(resumed, at(34.99)).phase).toBe('focus');
    expect(advance(resumed, at(35))).toMatchObject({ phase: 'break', segmentStartedAt: at(35) });
  });

  it('does not let a paused round complete', () => {
    const paused = pauseSession(started({ strictness: 'gentle' }), at(10));

    expect(advance(paused, at(10 * 60))).toEqual(paused);
  });

  it('allows unlimited pauses on gentle', () => {
    let state = started({ strictness: 'gentle' });

    for (let i = 0; i < 6; i++) {
      state = resumeSession(pauseSession(state, at(i + 1)), at(i + 1));
    }

    expect(state.pausesUsed).toBe(6);
    expect(pausesLeft(state)).toBeNull();
  });

  it('allows two pauses on medium, then refuses', () => {
    let state = started({ strictness: 'medium' });
    expect(pausesLeft(state)).toBe(2);

    state = resumeSession(pauseSession(state, at(1)), at(2));
    expect(pausesLeft(state)).toBe(1);

    state = resumeSession(pauseSession(state, at(3)), at(4));
    expect(pausesLeft(state)).toBe(0);

    expect(() => pauseSession(state, at(5))).toThrow('No pauses left');
  });

  it('allows no pauses on hard', () => {
    const state = started({ strictness: 'hard' });

    expect(pausesLeft(state)).toBe(0);
    expect(() => pauseSession(state, at(1))).toThrow('No pauses left');
  });

  it('ends a medium pause by itself after 5 minutes, crediting the time from then on', () => {
    const paused = pauseSession(started({ strictness: 'medium' }), at(10));

    // The pause ran out at minute 15, so by minute 20 the clock has run for 5 more minutes.
    const later = advance(paused, at(20));

    expect(isPaused(later)).toBe(false);
    expect(later.segmentStartedAt).toBe(at(15));
    expect(later.pausesUsed).toBe(1);
    expect(remainingMs(later, at(20))).toBe(10 * MIN);
  });

  it('keeps a medium pause going until its time is up', () => {
    const paused = pauseSession(started({ strictness: 'medium' }), at(10));

    expect(isPaused(advance(paused, at(14.99)))).toBe(true);
    expect(isPaused(advance(paused, at(15)))).toBe(false);
  });

  it('finishes the round and moves on after an expired pause', () => {
    const paused = pauseSession(started({ strictness: 'medium' }), at(10));

    // 10 minutes before the pause + 15 after it ends at minute 15 => the round ends at 30.
    const state = advance(paused, at(31));

    expect(state).toMatchObject({ phase: 'break', round: 1, segmentStartedAt: at(30) });
  });

  it('refuses a pause that comes after the round was already due', () => {
    expect(() => pauseSession(started(), at(26))).toThrow('Only a focus round');
  });

  it('cannot pause while preparing, on a break or after the end', () => {
    expect(() => pauseSession(prepared(), at(1))).toThrow('Only a focus round');
    expect(() => pauseSession(started(), at(27))).toThrow('Only a focus round');
    expect(() => pauseSession(abandonSession(started(), at(1)), at(2))).toThrow(
      'Only a focus round'
    );
  });

  it('cannot pause twice or resume without a pause', () => {
    const paused = pauseSession(started({ strictness: 'gentle' }), at(1));

    expect(() => pauseSession(paused, at(2))).toThrow('already paused');
    expect(() => resumeSession(started(), at(1))).toThrow('not paused');
  });
});

describe('abandonSession', () => {
  it('keeps the focus time of the unfinished round', () => {
    const state = abandonSession(started(), at(10));

    expect(state).toMatchObject({
      phase: 'ended',
      endReason: 'abandoned',
      endedAt: at(10),
      focusedMs: 10 * MIN
    });
  });

  it('keeps finished rounds when abandoned during a break', () => {
    const state = abandonSession(started(), at(27));

    expect(state).toMatchObject({ endReason: 'abandoned', focusedMs: 25 * MIN });
  });

  it('adds the finished rounds to the part of the current one', () => {
    // Round 2 starts at minute 30, so minute 35 is 5 minutes into it.
    expect(abandonSession(started(), at(35)).focusedMs).toBe(30 * MIN);
  });

  it('does not count time spent paused', () => {
    const paused = pauseSession(started({ strictness: 'gentle' }), at(10));

    expect(abandonSession(paused, at(20)).focusedMs).toBe(10 * MIN);
  });

  it('can abandon before starting, with nothing focused', () => {
    expect(abandonSession(prepared(), at(1))).toMatchObject({
      endReason: 'abandoned',
      focusedMs: 0
    });
  });

  it('cannot abandon a session that already ended', () => {
    const completed = advance(started({ rounds: 1 }), at(30));

    expect(() => abandonSession(completed, at(31))).toThrow('already ended');
    expect(() => abandonSession(abandonSession(started(), at(1)), at(2))).toThrow('already ended');
  });
});

describe('being away', () => {
  it('stops the clock at the moment the input stopped, not at the moment it was noticed', () => {
    // Input stopped at minute 10 and the app only noticed at minute 15.
    const away = goAway(started(), at(10), at(15));

    expect(isAway(away)).toBe(true);
    expect(away.awaySince).toBe(at(10));
    expect(remainingMs(away, at(15))).toBe(15 * MIN);
    expect(remainingMs(away, at(300))).toBe(15 * MIN);
  });

  it('does not count the time away as focus', () => {
    const away = goAway(started(), at(10), at(15));

    expect(focusedMsSoFar(away, at(60))).toBe(10 * MIN);
    expect(abandonSession(away, at(60)).focusedMs).toBe(10 * MIN);
  });

  it('does not use up a pause', () => {
    const base = started({ strictness: 'medium' });

    const back = comeBack(goAway(base, at(10), at(15)), at(20));

    expect(back.pausesUsed).toBe(0);
    expect(pausesLeft(back)).toBe(2);
  });

  it('starts the clock again when the person comes back, and the round ends later by the time away', () => {
    const away = goAway(started(), at(10), at(15));

    const back = comeBack(away, at(20));

    expect(isAway(back)).toBe(false);
    expect(back.segmentStartedAt).toBe(at(20));
    expect(back.awayMs).toBe(10 * MIN);
    // 15 minutes of the round were left, so it ends 15 minutes after coming back.
    expect(advance(back, at(34.99)).phase).toBe('focus');
    expect(advance(back, at(35))).toMatchObject({ phase: 'break', focusedMs: 25 * MIN });
  });

  it('adds up several stretches away', () => {
    let state = started({ rounds: 4, focusMinutes: 60 });
    state = comeBack(goAway(state, at(10), at(10)), at(15));
    state = comeBack(goAway(state, at(20), at(21)), at(30));

    expect(state.awayMs).toBe(15 * MIN);
    expect(awayMsSoFar(state, at(100))).toBe(15 * MIN);
  });

  it('counts a stretch that is still going on', () => {
    const away = goAway(started(), at(10), at(15));

    expect(awayMsSoFar(away, at(40))).toBe(30 * MIN);
  });

  it('does not let a round that came due while away complete on their behalf', () => {
    // The round is due at minute 25. Input stopped at minute 24 and was noticed at minute 40.
    const away = goAway(started(), at(24), at(40));

    expect(away).toMatchObject({ phase: 'focus', round: 1, awaySince: at(24) });
    expect(remainingMs(away, at(40))).toBe(1 * MIN);
    expect(advance(away, at(500))).toEqual(away);
  });

  it('keeps a round that finished before the input stopped', () => {
    // The round ended at minute 25, and input stopped at minute 26, during the break.
    const result = goAway(started(), at(26), at(40));

    expect(result.phase).toBe('break');
    expect(result.awaySince).toBeNull();
    expect(result.focusedMs).toBe(25 * MIN);
  });

  it('cannot stop the clock before it started running', () => {
    const resumed = resumeSession(pauseSession(started({ strictness: 'gentle' }), at(5)), at(8));

    const away = goAway(resumed, at(6), at(12));

    expect(away.awaySince).toBe(at(8));
    expect(remainingMs(away, at(12))).toBe(20 * MIN);
  });

  it('uses the current moment if the input stopped "in the future"', () => {
    expect(goAway(started(), at(50), at(12)).awaySince).toBe(at(12));
  });

  it('is ignored during a pause, on a break, before the start and after the end', () => {
    const paused = pauseSession(started({ strictness: 'gentle' }), at(5));
    const onBreak = advance(started(), at(27));
    const ended = abandonSession(started(), at(5));

    expect(goAway(paused, at(6), at(7))).toEqual(paused);
    expect(goAway(onBreak, at(28), at(29))).toEqual(onBreak);
    expect(goAway(prepared(), at(1), at(2))).toEqual(prepared());
    expect(goAway(ended, at(6), at(7))).toEqual(ended);
  });

  it('does nothing the second time', () => {
    const away = goAway(started(), at(10), at(15));

    expect(goAway(away, at(12), at(20))).toEqual(away);
  });

  it('does nothing when coming back without having been away', () => {
    const state = started();

    expect(comeBack(state, at(5))).toBe(state);
  });

  it('never counts time backwards when the clock moves back', () => {
    const away = goAway(started(), at(10), at(15));

    expect(comeBack(away, at(5)).awayMs).toBe(0);
  });

  it('refuses a pause while away', () => {
    const away = goAway(started({ strictness: 'gentle' }), at(10), at(15));

    expect(() => pauseSession(away, at(16))).toThrow('stopped because you were away');
  });

  it('ends the session with the time away added up when abandoned', () => {
    const away = goAway(started(), at(10), at(15));

    const ended = abandonSession(away, at(40));

    expect(ended).toMatchObject({ awaySince: null, awayMs: 30 * MIN, endReason: 'abandoned' });
  });

  it('survives being saved as JSON and loaded again while away', () => {
    const away = goAway(started(), at(10), at(15));
    const restored = JSON.parse(JSON.stringify(away)) as SessionState;

    expect(restored).toEqual(away);
    expect(comeBack(restored, at(30))).toEqual(comeBack(away, at(30)));
  });

  it('never changes a state it is given', () => {
    const frozen = deepFreeze(started());

    const away = deepFreeze(goAway(frozen, at(10), at(15)));
    const back = comeBack(away, at(20));

    expect(frozen.awaySince).toBeNull();
    expect(away.awaySince).toBe(at(10));
    expect(back.awaySince).toBeNull();
  });
});

describe('derived values', () => {
  it('counts focus time up to the full round and never beyond it', () => {
    const state = started();

    expect(focusedMsSoFar(state, at(0))).toBe(0);
    expect(focusedMsSoFar(state, at(10))).toBe(10 * MIN);
    // Before advance() runs, the clock may be past the end; it still counts only one round.
    expect(focusedMsSoFar(state, at(40))).toBe(25 * MIN);
  });

  it('never lets focus time go down as time passes', () => {
    let previous = 0;
    for (let minute = 0; minute <= 130; minute += 1) {
      const now = at(minute);
      const total = focusedMsSoFar(advance(started(), now), now);
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
    expect(previous).toBe(100 * MIN);
  });

  it('has no clock while preparing or after the end', () => {
    expect(phaseDurationMs(prepared())).toBe(0);
    expect(remainingMs(prepared(), at(5))).toBe(0);
    expect(remainingMs(abandonSession(started(), at(5)), at(6))).toBe(0);
  });
});

describe('purity and saving', () => {
  it('never changes the state it is given', () => {
    const frozen = deepFreeze(started({ strictness: 'gentle' }));

    const paused = pauseSession(frozen, at(5));
    const resumed = resumeSession(deepFreeze(paused), at(6));
    const later = advance(deepFreeze(resumed), at(500));

    expect(frozen.phase).toBe('focus');
    expect(later.phase).toBe('ended');
  });

  it('survives being saved as JSON and loaded again at any moment', () => {
    const state = pauseSession(started({ strictness: 'gentle' }), at(10));
    const restored = JSON.parse(JSON.stringify(state)) as SessionState;

    expect(restored).toEqual(state);
    expect(advance(restored, at(40))).toEqual(advance(state, at(40)));
    expect(resumeSession(restored, at(41))).toEqual(resumeSession(state, at(41)));
  });
});
