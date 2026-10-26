import type { Strictness } from '../../../shared/goal';

// Display text for each strictness level, matching the behavior described in docs/overview.md.
export const STRICTNESS_INFO: Record<Strictness, { label: string; summary: string }> = {
  gentle: { label: 'Gentle', summary: 'Warns you and costs HP. One revive per run.' },
  medium: { label: 'Medium', summary: 'Blocks distractions. Overrides cost tokens.' },
  hard: { label: 'Hard', summary: 'Closes blocked apps. No revive, no override.' }
};
