// Types and limits for goals, shared by the main process, the preload and the renderer.

export const STRICTNESS_LEVELS = ['gentle', 'medium', 'hard'] as const;
export type Strictness = (typeof STRICTNESS_LEVELS)[number];

export const MAX_TITLE_LENGTH = 100;
export const MIN_TARGET_HOURS = 0.5;
export const MAX_TARGET_HOURS = 1000;
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 5;

// What the dashboard form sends when creating a goal.
export interface NewGoal {
  title: string;
  targetHours: number;
  difficulty: number;
  strictness: Strictness;
}

// A saved goal, as stored in the database.
export interface Goal extends NewGoal {
  id: number;
  createdAt: string;
}
