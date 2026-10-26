import { useEffect, useState } from 'react';
import type { MoveDirection, Todo, TodoChanges } from '../../../shared/todo';
import TodoForm from './TodoForm';
import TodoItem from './TodoItem';

interface TodoListProps {
  goalId: number;
}

type LoadStatus = 'loading' | 'ready' | 'error';

// The checklist of one goal. It loads when opened and keeps the main process in sync with
// every change, replacing its own copy with what the main process sends back.
function TodoList({ goalId }: TodoListProps): React.JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [message, setMessage] = useState<string | null>(null);

  // Load the tasks once. The flag stops a late answer from updating a closed list.
  useEffect(() => {
    let cancelled = false;

    window.api.todos
      .list(goalId)
      .then((saved) => {
        if (!cancelled) {
          setTodos(saved);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [goalId]);

  // Runs one change against the main process and shows a message if it fails.
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setMessage(null);
    try {
      return await action();
    } catch {
      setMessage('Something went wrong. Please try again.');
      return undefined;
    }
  }

  function replace(updated: Todo): void {
    setTodos((current) => current.map((todo) => (todo.id === updated.id ? updated : todo)));
  }

  async function handleAdd(changes: TodoChanges): Promise<boolean> {
    const created = await run(() => window.api.todos.create({ goalId, ...changes }));
    if (!created) {
      return false;
    }
    setTodos((current) => [...current, created]);
    return true;
  }

  async function handleToggle(todo: Todo): Promise<void> {
    const updated = await run(() => window.api.todos.setDone({ id: todo.id, done: !todo.done }));
    if (updated) {
      replace(updated);
    }
  }

  async function handleSave(todo: Todo, changes: TodoChanges): Promise<boolean> {
    const updated = await run(() => window.api.todos.update({ id: todo.id, ...changes }));
    if (!updated) {
      return false;
    }
    replace(updated);
    return true;
  }

  async function handleMove(todo: Todo, direction: MoveDirection): Promise<void> {
    const reordered = await run(() => window.api.todos.move({ id: todo.id, direction }));
    if (reordered) {
      setTodos(reordered);
    }
  }

  async function handleDelete(todo: Todo): Promise<void> {
    const deleted = await run(async () => {
      await window.api.todos.delete(todo.id);
      return true;
    });
    if (deleted) {
      setTodos((current) => current.filter((item) => item.id !== todo.id));
    }
  }

  const doneCount = todos.filter((todo) => todo.done).length;

  return (
    <div className="todo-list">
      <TodoForm idPrefix={`add-${goalId}`} submitLabel="Add" clearOnSuccess onSubmit={handleAdd} />

      {message && (
        <p className="pixel-error" role="alert">
          {message}
        </p>
      )}

      {status === 'loading' && <p className="pixel-note">Loading...</p>}
      {status === 'error' && (
        <p className="pixel-error" role="alert">
          Could not load the tasks. Close and open the list to try again.
        </p>
      )}
      {status === 'ready' && todos.length === 0 && (
        <p className="pixel-note">No tasks yet. Add the first step above.</p>
      )}
      {status === 'ready' && todos.length > 0 && (
        <>
          <p className="pixel-note" aria-live="polite">
            {doneCount} of {todos.length} done
          </p>
          <ul className="todo-items">
            {todos.map((todo, index) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                isFirst={index === 0}
                isLast={index === todos.length - 1}
                onToggle={handleToggle}
                onSave={handleSave}
                onMove={handleMove}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default TodoList;
