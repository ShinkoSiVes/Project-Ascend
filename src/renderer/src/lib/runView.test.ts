import { describe, expect, it } from 'vitest';
import type { RunState } from '../../../shared/run';
import { createRun, advanceRun, recordFocus } from '../../../shared/runEngine';
import {
  dayKindLabel,
  perkNotes,
  quotaSummary,
  runStatusLabel,
  sessionRunHint,
  stageMarkers
} from './runView';

const MIN = 60_000;
const d = (days: number): number => new Date(2026, 9, 27 + days, 10, 0, 0).getTime();

function fresh(): RunState {
  return createRun({ goalId: 1, targetHours: 10, difficulty: 2, seed: 7 }, d(0));
}

function states(run: RunState): string[] {
  return stageMarkers(run).map((marker) => marker.state);
}

describe('stageMarkers', () => {
  it('has one marker per stage, numbered from 1, with the stage kind and quota', () => {
    const run = fresh();

    const markers = stageMarkers(run);

    expect(markers).toHaveLength(run.stages.length);
    expect(markers.map((m) => m.index)).toEqual(run.stages.map((s) => s.index));
    expect(markers.map((m) => m.kind)).toEqual(run.stages.map((s) => s.kind));
  });

  it('marks today as the first stage and the rest as upcoming at the start', () => {
    const [first, ...rest] = states(fresh());

    expect(first).toBe('today');
    expect(rest.every((state) => state === 'upcoming')).toBe(true);
  });

  it('marks today as cleared once the quota is met', () => {
    const run = fresh();
    const cleared = recordFocus(run, 1, run.quotaMinutes * MIN, d(0));

    expect(states(cleared)[0]).toBe('todayCleared');
  });

  it('shows how earlier stages ended, including one forgiven by a Shield', () => {
    let run = fresh();
    run = recordFocus(run, 1, run.quotaMinutes * MIN, d(0));
    run = { ...advanceRun(run, d(1)), shields: 1 };
    // Day 1 passes without focus, so the Shield forgives stage 2.
    run = advanceRun(run, d(2));

    expect(states(run).slice(0, 4)).toEqual(['cleared', 'forgiven', 'today', 'upcoming']);
  });

  it('marks the stage where a run failed', () => {
    const failed = advanceRun(fresh(), d(1));

    expect(failed.status).toBe('failed');
    expect(states(failed)[0]).toBe('failed');
    expect(states(failed)[1]).toBe('upcoming');
  });

  it('marks every stage of a won run as finished', () => {
    let run = createRun({ goalId: 1, targetHours: 0.5, difficulty: 1, seed: 11 }, d(0));
    for (let day = 0; day < 3; day++) {
      // 600 minutes is far more than any stage asks, so each day is cleared.
      run = recordFocus(advanceRun(run, d(day)), 1, 600 * MIN, d(day));
    }

    expect(run.status).toBe('completed');
    expect(states(run)).toEqual(['cleared', 'cleared', 'cleared']);
  });

  it("shows the current stage's real quota after a perk lightened it", () => {
    let run = fresh();
    run = recordFocus(run, 1, run.quotaMinutes * MIN, d(0));
    run = advanceRun({ ...run, lighterNext: true }, d(1));

    const markers = stageMarkers(run);

    expect(markers[1].quotaMinutes).toBe(run.quotaMinutes);
    expect(markers[1].quotaMinutes).toBeLessThan(run.stages[1].quotaMinutes);
    expect(markers[2].quotaMinutes).toBe(run.stages[2].quotaMinutes);
  });

  it('describes each stage for a screen reader', () => {
    const [first, , , , fifth] = stageMarkers(fresh());

    expect(first.label).toBe('Stage 1, normal day, 30 minutes, today');
    expect(fifth.label).toMatch(/^Stage 5, boss day, \d+ minutes, upcoming$/);
  });
});

describe('quotaSummary', () => {
  it('shows the start of the day', () => {
    expect(quotaSummary(fresh())).toEqual({
      doneMinutes: 0,
      quotaMinutes: 30,
      percent: 0,
      remainingMinutes: 30,
      text: '30 more minutes of focus clears today.'
    });
  });

  it('counts whole minutes done and rounds the minutes left up', () => {
    const run = recordFocus(fresh(), 1, 10 * MIN + 30_000, d(0));

    expect(quotaSummary(run)).toMatchObject({ doneMinutes: 10, remainingMinutes: 20, percent: 35 });
  });

  it('says "minute" for exactly one', () => {
    const run = recordFocus(fresh(), 1, 29 * MIN, d(0));

    expect(quotaSummary(run).text).toBe('1 more minute of focus clears today.');
  });

  it('says tomorrow is the next stage once cleared, and caps the bar at 100', () => {
    const run = recordFocus(fresh(), 1, 90 * MIN, d(0));

    expect(quotaSummary(run)).toMatchObject({
      percent: 100,
      remainingMinutes: 0,
      text: "Today's quota is cleared. Tomorrow is stage 2."
    });
  });

  it('has its own words for the last stage', () => {
    const run = { ...fresh(), stageIndex: 16, cleared: true };

    expect(quotaSummary(run).text).toBe('The last stage is cleared.');
  });
});

describe('sessionRunHint', () => {
  it('says nothing when there is no active run', () => {
    expect(sessionRunHint(null, 1)).toBeNull();
    expect(sessionRunHint({ ...fresh(), status: 'failed' }, 1)).toBeNull();
  });

  it('says a session for the run quest counts toward the quota, and when', () => {
    const hint = sessionRunHint(fresh(), 1)!;

    expect(hint).toContain('counts toward today');
    expect(hint).toContain('30 min left');
    expect(hint).toContain('when the session ends');
  });

  it('says a session for another quest does not count toward the quota', () => {
    expect(sessionRunHint(fresh(), 2)).toContain('does not count toward its quota');
  });

  it('says a cleared quota still earns XP', () => {
    const cleared = recordFocus(fresh(), 1, 60 * MIN, d(0));

    expect(sessionRunHint(cleared, 1)).toContain('already cleared');
  });
});

describe('perkNotes', () => {
  it('is empty without perks', () => {
    expect(perkNotes(fresh())).toEqual([]);
  });

  it('lists every perk the run has, with the right plurals', () => {
    const run = { ...fresh(), shields: 2, xpBoostPercent: 50, rerolls: 1, lighterNext: true };

    expect(perkNotes(run)).toEqual([
      '2 Shields',
      'XP boost +50%',
      '1 Reroll',
      'Lighter quota tomorrow'
    ]);
    expect(perkNotes({ ...fresh(), shields: 1 })).toEqual(['1 Shield']);
    expect(perkNotes({ ...fresh(), rerolls: 3 })).toEqual(['3 Rerolls']);
  });
});

describe('labels', () => {
  it('names the kinds of day', () => {
    expect(dayKindLabel('normal')).toBe('Normal day');
    expect(dayKindLabel('boss')).toBe('Boss day');
    expect(dayKindLabel('rest')).toBe('Rest day');
  });

  it('names every run status', () => {
    expect(runStatusLabel('active')).toBe('Active');
    expect(runStatusLabel('failed')).toBe('Failed');
    expect(runStatusLabel('completed')).toBe('Won');
    expect(runStatusLabel('abandoned')).toBe('Ended');
  });
});
