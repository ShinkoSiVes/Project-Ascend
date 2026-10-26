// What a run looks like on screen, worked out from its state. Pure, so it can be tested.

import {
  remainingQuotaMs,
  type RunState,
  type RunStatus,
  type StageKind
} from '../../../shared/run';
import { MS_PER_MINUTE } from '../../../shared/session';

export type MarkerState = 'cleared' | 'forgiven' | 'today' | 'todayCleared' | 'upcoming' | 'failed';

export interface StageMarker {
  index: number;
  kind: StageKind;
  quotaMinutes: number;
  state: MarkerState;
  // What a screen reader says, for example "Stage 5, boss day, 70 minutes, cleared".
  label: string;
}

export function dayKindLabel(kind: StageKind): string {
  if (kind === 'boss') {
    return 'Boss day';
  }
  return kind === 'rest' ? 'Rest day' : 'Normal day';
}

const STATE_LABELS: Record<MarkerState, string> = {
  cleared: 'cleared',
  forgiven: 'forgiven by a Shield',
  today: 'today',
  todayCleared: 'today, cleared',
  upcoming: 'upcoming',
  failed: 'missed, the run ended here'
};

// One marker per stage: how each finished stage ended, which one is today's, and what is ahead.
export function stageMarkers(run: RunState): StageMarker[] {
  return run.stages.map((stage) => {
    let state: MarkerState;

    if (stage.index < run.stageIndex) {
      state = run.results[stage.index - 1] ?? 'cleared';
    } else if (stage.index > run.stageIndex) {
      state = 'upcoming';
    } else if (run.status === 'failed') {
      state = 'failed';
    } else if (run.results[stage.index - 1]) {
      // The last stage of a run that was won already has its result.
      state = run.results[stage.index - 1];
    } else {
      state = run.cleared ? 'todayCleared' : 'today';
    }

    // The current stage shows its real quota, which perks may have lightened.
    const quotaMinutes = stage.index === run.stageIndex ? run.quotaMinutes : stage.quotaMinutes;
    return {
      index: stage.index,
      kind: stage.kind,
      quotaMinutes,
      state,
      label: `Stage ${stage.index}, ${dayKindLabel(stage.kind).toLowerCase()}, ${quotaMinutes} minutes, ${STATE_LABELS[state]}`
    };
  });
}

export interface QuotaSummary {
  doneMinutes: number;
  quotaMinutes: number;
  // 0 to 100, for a progress bar.
  percent: number;
  remainingMinutes: number;
  text: string;
}

// Today's quota in numbers and in words.
export function quotaSummary(run: RunState): QuotaSummary {
  const doneMinutes = Math.floor(run.focusedMs / MS_PER_MINUTE);
  const remainingMinutes = Math.ceil(remainingQuotaMs(run) / MS_PER_MINUTE);
  const percent = Math.min(
    100,
    Math.floor((run.focusedMs / (run.quotaMinutes * MS_PER_MINUTE)) * 100)
  );

  let text: string;
  if (run.cleared) {
    text =
      run.stageIndex >= run.stages.length
        ? 'The last stage is cleared.'
        : `Today's quota is cleared. Tomorrow is stage ${run.stageIndex + 1}.`;
  } else {
    text = `${remainingMinutes} more ${remainingMinutes === 1 ? 'minute' : 'minutes'} of focus clears today.`;
  }

  return { doneMinutes, quotaMinutes: run.quotaMinutes, percent, remainingMinutes, text };
}

// The perks and Shields a run has, as short pieces of text for a line under the stage map.
export function perkNotes(run: RunState): string[] {
  const notes: string[] = [];

  if (run.shields > 0) {
    notes.push(`${run.shields} ${run.shields === 1 ? 'Shield' : 'Shields'}`);
  }
  if (run.xpBoostPercent > 0) {
    notes.push(`XP boost +${run.xpBoostPercent}%`);
  }
  if (run.rerolls > 0) {
    notes.push(`${run.rerolls} ${run.rerolls === 1 ? 'Reroll' : 'Rerolls'}`);
  }
  if (run.lighterNext) {
    notes.push('Lighter quota tomorrow');
  }
  return notes;
}

// A line for the prep screen: whether the session about to start counts toward the run.
export function sessionRunHint(run: RunState | null, goalId: number): string | null {
  if (!run || run.status !== 'active') {
    return null;
  }
  if (run.goalId !== goalId) {
    return 'Your run is for another quest, so this session earns pet XP but does not count toward its quota.';
  }
  if (run.cleared) {
    return "Today's quota is already cleared. More focus here still earns XP.";
  }
  return `This session counts toward today's run quota (${quotaSummary(run).remainingMinutes} min left). It counts when the session ends.`;
}

const STATUS_LABELS: Record<RunStatus, string> = {
  active: 'Active',
  failed: 'Failed',
  completed: 'Won',
  abandoned: 'Ended'
};

export function runStatusLabel(status: RunStatus): string {
  return STATUS_LABELS[status];
}
