import { describe, expect, it } from 'vitest';
import { moodText } from './petText';

describe('moodText', () => {
  it('says something different for each mood, using the pet name', () => {
    const texts = (['happy', 'neutral', 'sad'] as const).map((mood) => moodText('Bean', mood));

    expect(new Set(texts).size).toBe(3);
    for (const text of texts) {
      expect(text).toContain('Bean');
    }
  });

  it('never blames the person when the pet is sad', () => {
    expect(moodText('Bean', 'sad')).toBe('Bean misses you. A short session will cheer them up.');
  });
});
