import { useState } from 'react';
import type { MoveDirection, Todo, TodoChanges } from '../../../shared/todo';
import PixelButton from './PixelButton';
import TodoForm from './TodoForm';

interface TodoItemProps {
  todo: Todo;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (todo: Todo) => void;
  onSave: (todo: Todo, changes: TodoChanges) => Promise<boolean>;
  onMove: (todo: Todo, direction: MoveDirection) => void;
  onDelete: (todo: Todo) => void;
}

// One task: a checkbox, its title and estimate, and buttons to reorder, edit or delete it.
function TodoItem({
  todo,
  isFirst,
  isLast,
  onToggle,
  onSave,
  onMove,
  onDelete
}: TodoItemProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <li className="todo-item">
        <TodoForm
          idPrefix={`edit-${todo.id}`}
          initial={{ title: todo.title, estimatePomodoros: todo.estimatePomodoros }}
          submitLabel="Save"
          onSubmit={async (changes) => {
            const saved = await onSave(todo, changes);
            if (saved) {
              setEditing(false);
            }
            return saved;
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className={`todo-item ${todo.done ? 'todo-item--done' : ''}`.trim()}>
      <label className="pixel-checkbox todo-item__main">
        <input
          className="visually-hidden"
          type="checkbox"
          checked={todo.done}
          onChange={() => onToggle(todo)}
        />
        <span className="pixel-checkbox__box" aria-hidden="true" />
        <span className="todo-item__title">{todo.title}</span>
      </label>

      {todo.estimatePomodoros !== null && (
        <span className="todo-item__estimate">{todo.estimatePomodoros} pom</span>
      )}

      <div className="todo-item__actions">
        <PixelButton
          size="small"
          disabled={isFirst}
          aria-label={`Move ${todo.title} up`}
          onClick={() => onMove(todo, 'up')}
        >
          Up
        </PixelButton>
        <PixelButton
          size="small"
          disabled={isLast}
          aria-label={`Move ${todo.title} down`}
          onClick={() => onMove(todo, 'down')}
        >
          Down
        </PixelButton>
        <PixelButton
          size="small"
          aria-label={`Edit ${todo.title}`}
          onClick={() => setEditing(true)}
        >
          Edit
        </PixelButton>

        {/* Deleting takes two clicks, so a slip of the mouse cannot remove a task. */}
        {confirmingDelete ? (
          <>
            <PixelButton
              size="small"
              variant="danger"
              aria-label={`Confirm deleting ${todo.title}`}
              onClick={() => onDelete(todo)}
            >
              Sure?
            </PixelButton>
            <PixelButton size="small" onClick={() => setConfirmingDelete(false)}>
              No
            </PixelButton>
          </>
        ) : (
          <PixelButton
            size="small"
            aria-label={`Delete ${todo.title}`}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </PixelButton>
        )}
      </div>
    </li>
  );
}

export default TodoItem;
