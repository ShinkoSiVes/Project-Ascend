import { describe, expect, it } from 'vitest';
import { STRICTNESS_LEVELS } from '../../../shared/goal';
import { STRICTNESS_INFO, pauseRuleText } from './strictness';

describe('pauseRuleText', () => {
  it('describes each strictness level', () => {
    expect(pauseRuleText('gentle')).toBe('Pauses: unlimited');
    expect(pauseRuleText('medium')).toBe('Pauses: 2, up to 5 min each');
    expect(pauseRuleText('hard')).toBe('Pauses: none');
  });
});

describe('STRICTNESS_INFO', () => {
  it('has a label and a summary for every level', () => {
    for (const level of STRICTNESS_LEVELS) {
      expect(STRICTNESS_INFO[level].label.length).toBeGreaterThan(0);
      expect(STRICTNESS_INFO[level].summary.length).toBeGreaterThan(0);
    }
  });
});
