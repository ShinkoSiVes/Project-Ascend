import type { PetMood } from '../../../shared/pet';

// A short line about how the pet feels, shown next to its face.
export function moodText(name: string, mood: PetMood): string {
  if (mood === 'happy') {
    return `${name} is happy.`;
  }
  if (mood === 'neutral') {
    return `${name} is waiting for you.`;
  }
  return `${name} misses you. A short session will cheer them up.`;
}
