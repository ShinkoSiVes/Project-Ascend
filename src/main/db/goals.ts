import type { DatabaseSync } from 'node:sqlite';
import {
  MAX_DIFFICULTY,
  MAX_TARGET_HOURS,
  MAX_TITLE_LENGTH,
  MIN_DIFFICULTY,
  MIN_TARGET_HOURS,
  STRICTNESS_LEVELS,
  type Goal,
  type NewGoal,
  type Strictness
} from '../../shared/goal';

// A goal as it comes out of SQLite, with snake_case column names.
interface GoalRow {
  id: number;
  title: string;
  target_hours: number;
  difficulty: number;
  strictness: string;
  created_at: string;
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    targetHours: row.target_hours,
    difficulty: row.difficulty,
    strictness: row.strictness as Strictness,
    createdAt: row.created_at
  };
}

// The renderer is untrusted, so every field is checked here instead of relying on its form.
export function parseNewGoal(input: unknown): NewGoal {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid goal');
  }
  const { title, targetHours, difficulty, strictness } = input as Record<string, unknown>;

  if (typeof title !== 'string') {
    throw new Error('Title must be text');
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length < 1 || trimmedTitle.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title must be 1 to ${MAX_TITLE_LENGTH} characters`);
  }

  if (
    typeof targetHours !== 'number' ||
    !Number.isFinite(targetHours) ||
    targetHours < MIN_TARGET_HOURS ||
    targetHours > MAX_TARGET_HOURS
  ) {
    throw new Error(`Target hours must be between ${MIN_TARGET_HOURS} and ${MAX_TARGET_HOURS}`);
  }

  if (
    typeof difficulty !== 'number' ||
    !Number.isInteger(difficulty) ||
    difficulty < MIN_DIFFICULTY ||
    difficulty > MAX_DIFFICULTY
  ) {
    throw new Error(
      `Difficulty must be a whole number from ${MIN_DIFFICULTY} to ${MAX_DIFFICULTY}`
    );
  }

  if (typeof strictness !== 'string' || !STRICTNESS_LEVELS.includes(strictness as Strictness)) {
    throw new Error(`Strictness must be one of: ${STRICTNESS_LEVELS.join(', ')}`);
  }

  return { title: trimmedTitle, targetHours, difficulty, strictness: strictness as Strictness };
}

// Validates the input and saves it as a new goal.
export function createGoal(db: DatabaseSync, input: unknown): Goal {
  const goal = parseNewGoal(input);
  const row = db
    .prepare(
      'INSERT INTO goals (title, target_hours, difficulty, strictness) VALUES (?, ?, ?, ?) RETURNING *'
    )
    .get(goal.title, goal.targetHours, goal.difficulty, goal.strictness) as unknown as GoalRow;
  return toGoal(row);
}

// Returns every goal, newest first.
export function listGoals(db: DatabaseSync): Goal[] {
  const rows = db.prepare('SELECT * FROM goals ORDER BY id DESC').all() as unknown as GoalRow[];
  return rows.map(toGoal);
}
