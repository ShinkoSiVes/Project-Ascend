// Types, limits and validation for to-do tasks, shared by the main process, the preload and the renderer.

export const MAX_TODO_TITLE_LENGTH = 200;
export const MIN_ESTIMATE = 1;
export const MAX_ESTIMATE = 99;

export const MOVE_DIRECTIONS = ['up', 'down'] as const;
export type MoveDirection = (typeof MOVE_DIRECTIONS)[number];

// The fields a person can edit on a task. The estimate is in pomodoros, or null for none.
export interface TodoChanges {
  title: string;
  estimatePomodoros: number | null;
}

// What the UI sends when adding a task to a goal.
export interface NewTodo extends TodoChanges {
  goalId: number;
}

// A saved task, as stored in the database.
export interface Todo extends NewTodo {
  id: number;
  done: boolean;
  position: number;
  createdAt: string;
  completedAt: string | null;
}

export type TodoErrors = Partial<Record<keyof TodoChanges, string>>;

// Ids come from the database, so anything that is not a positive whole number is a mistake.
export function isValidId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// Checks the editable fields of a task and returns a message per invalid field.
// An empty object means the task is valid. The form shows these messages, and the main
// process runs the same check, so the two can never disagree.
export function checkTodoFields(input: Record<string, unknown>): TodoErrors {
  const { title, estimatePomodoros } = input;
  const errors: TodoErrors = {};

  if (
    typeof title !== 'string' ||
    title.trim().length < 1 ||
    title.trim().length > MAX_TODO_TITLE_LENGTH
  ) {
    errors.title = `Task must be 1 to ${MAX_TODO_TITLE_LENGTH} characters`;
  }

  const emptyEstimate = estimatePomodoros === null;
  if (
    !emptyEstimate &&
    (typeof estimatePomodoros !== 'number' ||
      !Number.isInteger(estimatePomodoros) ||
      estimatePomodoros < MIN_ESTIMATE ||
      estimatePomodoros > MAX_ESTIMATE)
  ) {
    errors.estimatePomodoros = `Estimate must be empty or a whole number from ${MIN_ESTIMATE} to ${MAX_ESTIMATE}`;
  }

  return errors;
}
