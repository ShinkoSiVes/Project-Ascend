import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { createGoal } from './goals';
import { inTransaction } from './transaction';
import { createTodo, deleteTodo, listTodos, moveTodo, setTodoDone, updateTodo } from './todos';

const goalInput = { title: 'A goal', targetHours: 5, difficulty: 2, strictness: 'gentle' };

let db: DatabaseSync;
let goalId: number;

beforeEach(() => {
  db = openDatabase(':memory:');
  goalId = createGoal(db, goalInput).id;
});

function addTitles(...titles: string[]): number[] {
  return titles.map((title) => createTodo(db, { goalId, title, estimatePomodoros: null }).id);
}

function titles(): string[] {
  return listTodos(db, goalId).map((todo) => todo.title);
}

describe('createTodo and listTodos', () => {
  it('saves a task as open, with a trimmed title', () => {
    const todo = createTodo(db, { goalId, title: '  Read chapter 3  ', estimatePomodoros: 2 });

    expect(todo).toMatchObject({
      goalId,
      title: 'Read chapter 3',
      estimatePomodoros: 2,
      done: false,
      completedAt: null
    });
    expect(todo.id).toBeGreaterThan(0);
    expect(new Date(todo.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('allows a task without an estimate', () => {
    const todo = createTodo(db, { goalId, title: 'No estimate', estimatePomodoros: null });

    expect(todo.estimatePomodoros).toBeNull();
  });

  it('lists tasks in the order they were added', () => {
    addTitles('first', 'second', 'third');

    expect(titles()).toEqual(['first', 'second', 'third']);
  });

  it('keeps each goal list separate', () => {
    const otherGoal = createGoal(db, { ...goalInput, title: 'Other goal' }).id;
    addTitles('mine');
    createTodo(db, { goalId: otherGoal, title: 'theirs', estimatePomodoros: null });

    expect(titles()).toEqual(['mine']);
    expect(listTodos(db, otherGoal).map((todo) => todo.title)).toEqual(['theirs']);
  });

  it('returns an empty list for a goal without tasks', () => {
    expect(listTodos(db, goalId)).toEqual([]);
  });

  it('rejects a task for a goal that does not exist', () => {
    expect(() =>
      createTodo(db, { goalId: 9999, title: 'orphan', estimatePomodoros: null })
    ).toThrow();
  });

  it.each([
    ['null', null],
    ['a string', 'task'],
    ['a missing goal', { title: 'x', estimatePomodoros: null }],
    ['a goal id of 0', { goalId: 0, title: 'x', estimatePomodoros: null }],
    ['a goal id as text', { goalId: '1', title: 'x', estimatePomodoros: null }],
    ['a blank title', { goalId: 1, title: '   ', estimatePomodoros: null }],
    ['an estimate of 0', { goalId: 1, title: 'x', estimatePomodoros: 0 }],
    ['a fractional estimate', { goalId: 1, title: 'x', estimatePomodoros: 1.5 }]
  ])('rejects %s and saves nothing', (_name, input) => {
    expect(() => createTodo(db, input)).toThrow();
    expect(listTodos(db, goalId)).toEqual([]);
  });

  it('rejects an invalid goal id when listing', () => {
    expect(() => listTodos(db, 'one')).toThrow();
    expect(() => listTodos(db, -1)).toThrow();
  });
});

describe('updateTodo', () => {
  it('changes the title and estimate', () => {
    const [id] = addTitles('old title');

    const todo = updateTodo(db, { id, title: '  new title ', estimatePomodoros: 4 });

    expect(todo).toMatchObject({ id, title: 'new title', estimatePomodoros: 4 });
    expect(titles()).toEqual(['new title']);
  });

  it('can clear the estimate', () => {
    const { id } = createTodo(db, { goalId, title: 'x', estimatePomodoros: 3 });

    expect(
      updateTodo(db, { id, title: 'x', estimatePomodoros: null }).estimatePomodoros
    ).toBeNull();
  });

  it('rejects bad input and a missing task', () => {
    const [id] = addTitles('keep');

    expect(() => updateTodo(db, { id, title: '', estimatePomodoros: null })).toThrow();
    expect(() => updateTodo(db, { id: 9999, title: 'x', estimatePomodoros: null })).toThrow(
      'Task not found'
    );
    expect(titles()).toEqual(['keep']);
  });
});

describe('setTodoDone', () => {
  it('checks a task off and records when', () => {
    const [id] = addTitles('task');

    const todo = setTodoDone(db, { id, done: true });

    expect(todo.done).toBe(true);
    expect(todo.completedAt).not.toBeNull();
  });

  it('reopens a task and clears the completion time', () => {
    const [id] = addTitles('task');
    setTodoDone(db, { id, done: true });

    const todo = setTodoDone(db, { id, done: false });

    expect(todo.done).toBe(false);
    expect(todo.completedAt).toBeNull();
  });

  it('keeps the first completion time when checked off twice', () => {
    const [id] = addTitles('task');
    const first = setTodoDone(db, { id, done: true });

    const second = setTodoDone(db, { id, done: true });

    expect(second.completedAt).toBe(first.completedAt);
  });

  it('rejects a non-boolean value and a missing task', () => {
    const [id] = addTitles('task');

    expect(() => setTodoDone(db, { id, done: 'yes' })).toThrow();
    expect(() => setTodoDone(db, { id: 9999, done: true })).toThrow('Task not found');
  });
});

describe('moveTodo', () => {
  it('moves a task up', () => {
    const [, second] = addTitles('first', 'second', 'third');

    const list = moveTodo(db, { id: second, direction: 'up' });

    expect(list.map((todo) => todo.title)).toEqual(['second', 'first', 'third']);
    expect(titles()).toEqual(['second', 'first', 'third']);
  });

  it('moves a task down', () => {
    const [first] = addTitles('first', 'second', 'third');

    expect(moveTodo(db, { id: first, direction: 'down' }).map((todo) => todo.title)).toEqual([
      'second',
      'first',
      'third'
    ]);
  });

  it('does nothing at the top or bottom', () => {
    const [first, , third] = addTitles('first', 'second', 'third');

    moveTodo(db, { id: first, direction: 'up' });
    moveTodo(db, { id: third, direction: 'down' });

    expect(titles()).toEqual(['first', 'second', 'third']);
  });

  it('moves over a gap left by a deleted task', () => {
    const [first, second, third] = addTitles('first', 'second', 'third');
    deleteTodo(db, second);

    moveTodo(db, { id: third, direction: 'up' });

    expect(titles()).toEqual(['third', 'first']);
    expect(first).toBeGreaterThan(0);
  });

  it('only swaps within the same goal', () => {
    const otherGoal = createGoal(db, { ...goalInput, title: 'Other goal' }).id;
    createTodo(db, { goalId: otherGoal, title: 'other', estimatePomodoros: null });
    const [mine] = addTitles('mine');

    moveTodo(db, { id: mine, direction: 'up' });

    expect(titles()).toEqual(['mine']);
  });

  it('rejects a bad direction and a missing task', () => {
    const [id] = addTitles('task');

    expect(() => moveTodo(db, { id, direction: 'sideways' })).toThrow('Invalid direction');
    expect(() => moveTodo(db, { id: 9999, direction: 'up' })).toThrow('Task not found');
  });

  it('puts a task added after a move at the end', () => {
    const [first] = addTitles('first', 'second');
    moveTodo(db, { id: first, direction: 'down' });

    addTitles('third');

    expect(titles()).toEqual(['second', 'first', 'third']);
  });
});

describe('deleteTodo', () => {
  it('removes only the chosen task', () => {
    const [, second] = addTitles('first', 'second', 'third');

    deleteTodo(db, second);

    expect(titles()).toEqual(['first', 'third']);
  });

  it('rejects a missing or invalid id', () => {
    expect(() => deleteTodo(db, 9999)).toThrow('Task not found');
    expect(() => deleteTodo(db, 'one')).toThrow();
  });

  it('is removed together with its goal', () => {
    addTitles('first', 'second');

    db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);

    const left = db.prepare('SELECT COUNT(*) AS n FROM todos').get() as { n: number };
    expect(left.n).toBe(0);
  });
});

describe('database constraints and transactions', () => {
  it('rejects bad rows even if validation is bypassed', () => {
    const insert = db.prepare(
      'INSERT INTO todos (goal_id, title, estimate_pomodoros, status, position) VALUES (?, ?, ?, ?, 1)'
    );

    expect(() => insert.run(goalId, '', null, 'open')).toThrow();
    expect(() => insert.run(goalId, 'x', 0, 'open')).toThrow();
    expect(() => insert.run(goalId, 'x', null, 'finished')).toThrow();
  });

  it('rolls back everything when the work throws', () => {
    expect(() =>
      inTransaction(db, () => {
        db.prepare("INSERT INTO todos (goal_id, title, position) VALUES (?, 'will vanish', 1)").run(
          goalId
        );
        throw new Error('boom');
      })
    ).toThrow('boom');

    expect(titles()).toEqual([]);
  });
});
