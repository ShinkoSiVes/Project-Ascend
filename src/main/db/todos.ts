import type { DatabaseSync } from 'node:sqlite';
import {
  checkTodoFields,
  isValidId,
  MOVE_DIRECTIONS,
  type MoveDirection,
  type Todo,
  type TodoChanges
} from '../../shared/todo';
import { inTransaction } from './transaction';

// A task as it comes out of SQLite, with snake_case column names.
interface TodoRow {
  id: number;
  goal_id: number;
  title: string;
  estimate_pomodoros: number | null;
  status: string;
  position: number;
  created_at: string;
  completed_at: string | null;
}

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    estimatePomodoros: row.estimate_pomodoros,
    done: row.status === 'done',
    position: row.position,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

// The renderer is untrusted, so everything it sends is checked before it reaches the database.
function requireObject(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid request');
  }
  return input as Record<string, unknown>;
}

function requireId(value: unknown, what: string): number {
  if (!isValidId(value)) {
    throw new Error(`Invalid ${what}`);
  }
  return value;
}

// The form shows these same messages; here only the first one is needed.
function parseChanges(fields: Record<string, unknown>): TodoChanges {
  const [firstError] = Object.values(checkTodoFields(fields));
  if (firstError) {
    throw new Error(firstError);
  }
  return {
    title: (fields.title as string).trim(),
    estimatePomodoros: fields.estimatePomodoros as number | null
  };
}

function findRow(db: DatabaseSync, id: number): TodoRow {
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as unknown as
    TodoRow | undefined;
  if (!row) {
    throw new Error('Task not found');
  }
  return row;
}

function listRows(db: DatabaseSync, goalId: number): Todo[] {
  const rows = db
    .prepare('SELECT * FROM todos WHERE goal_id = ? ORDER BY position ASC')
    .all(goalId) as unknown as TodoRow[];
  return rows.map(toTodo);
}

// Returns the tasks of one goal in the order the person arranged them.
export function listTodos(db: DatabaseSync, goalId: unknown): Todo[] {
  return listRows(db, requireId(goalId, 'goal'));
}

// Adds a task at the end of the goal's list.
export function createTodo(db: DatabaseSync, input: unknown): Todo {
  const fields = requireObject(input);
  const goalId = requireId(fields.goalId, 'goal');
  const changes = parseChanges(fields);

  return inTransaction(db, () => {
    const { next } = db
      .prepare('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM todos WHERE goal_id = ?')
      .get(goalId) as { next: number };
    const row = db
      .prepare(
        'INSERT INTO todos (goal_id, title, estimate_pomodoros, position) VALUES (?, ?, ?, ?) RETURNING *'
      )
      .get(goalId, changes.title, changes.estimatePomodoros, next) as unknown as TodoRow;
    return toTodo(row);
  });
}

// Changes the title and estimate of a task.
export function updateTodo(db: DatabaseSync, input: unknown): Todo {
  const fields = requireObject(input);
  const id = requireId(fields.id, 'task');
  const changes = parseChanges(fields);

  const row = db
    .prepare('UPDATE todos SET title = ?, estimate_pomodoros = ? WHERE id = ? RETURNING *')
    .get(changes.title, changes.estimatePomodoros, id) as unknown as TodoRow | undefined;
  if (!row) {
    throw new Error('Task not found');
  }
  return toTodo(row);
}

// Checks a task off or reopens it. The first completion time is kept if it is checked off again.
export function setTodoDone(db: DatabaseSync, input: unknown): Todo {
  const fields = requireObject(input);
  const id = requireId(fields.id, 'task');
  if (typeof fields.done !== 'boolean') {
    throw new Error('Invalid request');
  }

  const status = fields.done ? 'done' : 'open';
  const row = db
    .prepare(
      `UPDATE todos
       SET status = ?1,
           completed_at = CASE
             WHEN ?1 = 'done' THEN COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             ELSE NULL
           END
       WHERE id = ?2
       RETURNING *`
    )
    .get(status, id) as unknown as TodoRow | undefined;
  if (!row) {
    throw new Error('Task not found');
  }
  return toTodo(row);
}

// Swaps a task with its neighbor and returns the goal's whole list in the new order.
export function moveTodo(db: DatabaseSync, input: unknown): Todo[] {
  const fields = requireObject(input);
  const id = requireId(fields.id, 'task');
  const direction = fields.direction;
  if (!MOVE_DIRECTIONS.includes(direction as MoveDirection)) {
    throw new Error('Invalid direction');
  }

  return inTransaction(db, () => {
    const current = findRow(db, id);
    const neighborQuery =
      direction === 'up'
        ? 'SELECT id, position FROM todos WHERE goal_id = ? AND position < ? ORDER BY position DESC LIMIT 1'
        : 'SELECT id, position FROM todos WHERE goal_id = ? AND position > ? ORDER BY position ASC LIMIT 1';
    const neighbor = db.prepare(neighborQuery).get(current.goal_id, current.position) as unknown as
      { id: number; position: number } | undefined;

    // At the top or bottom there is nothing to swap with, so the order stays as it is.
    if (neighbor) {
      const setPosition = db.prepare('UPDATE todos SET position = ? WHERE id = ?');
      setPosition.run(neighbor.position, current.id);
      setPosition.run(current.position, neighbor.id);
    }
    return listRows(db, current.goal_id);
  });
}

// Deletes a task. Gaps in the positions are fine, only the order matters.
export function deleteTodo(db: DatabaseSync, id: unknown): void {
  const { changes } = db.prepare('DELETE FROM todos WHERE id = ?').run(requireId(id, 'task'));
  if (changes === 0) {
    throw new Error('Task not found');
  }
}
