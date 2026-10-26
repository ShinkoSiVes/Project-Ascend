import type { DatabaseSync } from 'node:sqlite';
import { checkGoal, type Goal, type NewGoal, type Strictness } from '../../shared/goal';

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

  // The form shows these same messages; here only the first one is needed.
  const [firstError] = Object.values(checkGoal(input as Record<string, unknown>));
  if (firstError) {
    throw new Error(firstError);
  }

  const { title, targetHours, difficulty, strictness } = input as NewGoal;
  return { title: title.trim(), targetHours, difficulty, strictness };
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
