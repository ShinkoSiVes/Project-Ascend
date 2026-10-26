// Types, limits and validation for goals, shared by the main process, the preload and the renderer.

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

export type GoalField = keyof NewGoal;
export type GoalErrors = Partial<Record<GoalField, string>>;

// Checks each field of a goal and returns a message per invalid field.
// An empty object means the goal is valid. The form shows these messages, and the main
// process runs the same check, so the two can never disagree.
export function checkGoal(input: Record<string, unknown>): GoalErrors {
  const { title, targetHours, difficulty, strictness } = input;
  const errors: GoalErrors = {};

  if (
    typeof title !== 'string' ||
    title.trim().length < 1 ||
    title.trim().length > MAX_TITLE_LENGTH
  ) {
    errors.title = `Title must be 1 to ${MAX_TITLE_LENGTH} characters`;
  }

  if (
    typeof targetHours !== 'number' ||
    !Number.isFinite(targetHours) ||
    targetHours < MIN_TARGET_HOURS ||
    targetHours > MAX_TARGET_HOURS
  ) {
    errors.targetHours = `Target hours must be between ${MIN_TARGET_HOURS} and ${MAX_TARGET_HOURS}`;
  }

  if (
    typeof difficulty !== 'number' ||
    !Number.isInteger(difficulty) ||
    difficulty < MIN_DIFFICULTY ||
    difficulty > MAX_DIFFICULTY
  ) {
    errors.difficulty = `Difficulty must be a whole number from ${MIN_DIFFICULTY} to ${MAX_DIFFICULTY}`;
  }

  if (typeof strictness !== 'string' || !STRICTNESS_LEVELS.includes(strictness as Strictness)) {
    errors.strictness = `Strictness must be one of: ${STRICTNESS_LEVELS.join(', ')}`;
  }

  return errors;
}
