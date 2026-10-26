import type { Strictness } from '../../../shared/goal';
import { PAUSE_RULES } from '../../../shared/session';

// Display text for each strictness level, matching the behavior described in docs/overview.md.
export const STRICTNESS_INFO: Record<Strictness, { label: string; summary: string }> = {
  gentle: { label: 'Gentle', summary: 'Warns you and costs HP. One revive per run.' },
  medium: { label: 'Medium', summary: 'Blocks distractions. Overrides cost tokens.' },
  hard: { label: 'Hard', summary: 'Closes blocked apps. No revive, no override.' }
};

// One line saying how much pausing a strictness level allows, built from the engine's rules.
export function pauseRuleText(strictness: Strictness): string {
  const { maxPauses, maxPauseMinutes } = PAUSE_RULES[strictness];

  if (maxPauses === null) {
    return 'Pauses: unlimited';
  }
  if (maxPauses === 0) {
    return 'Pauses: none';
  }
  return `Pauses: ${maxPauses}, up to ${maxPauseMinutes} min each`;
}
