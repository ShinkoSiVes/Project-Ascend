import { useState, type FormEvent } from 'react';
import {
  checkTodoFields,
  MAX_ESTIMATE,
  MAX_TODO_TITLE_LENGTH,
  MIN_ESTIMATE,
  type TodoChanges,
  type TodoErrors
} from '../../../shared/todo';
import PixelButton from './PixelButton';

interface TodoFormProps {
  // Makes the input ids unique when several forms are on screen.
  idPrefix: string;
  initial?: TodoChanges;
  submitLabel: string;
  // The add form empties itself after a save; the edit form is closed by its parent instead.
  clearOnSuccess?: boolean;
  // Resolves to true when the task was saved.
  onSubmit: (changes: TodoChanges) => Promise<boolean>;
  onCancel?: () => void;
}

// One form for both adding and editing a task: a title and an optional pomodoro estimate.
function TodoForm({
  idPrefix,
  initial,
  submitLabel,
  clearOnSuccess = false,
  onSubmit,
  onCancel
}: TodoFormProps): React.JSX.Element {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [estimate, setEstimate] = useState(initial?.estimatePomodoros?.toString() ?? '');
  const [errors, setErrors] = useState<TodoErrors>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    // An empty estimate means "no estimate", not zero.
    const changes = { title, estimatePomodoros: estimate.trim() === '' ? null : Number(estimate) };
    const found = checkTodoFields(changes);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setSaving(true);
    const saved = await onSubmit(changes);
    setSaving(false);

    if (saved && clearOnSuccess) {
      setTitle('');
      setEstimate('');
    }
  }

  return (
    <form className="todo-form" onSubmit={handleSubmit} noValidate>
      <input
        id={`${idPrefix}-title`}
        className="pixel-input"
        type="text"
        aria-label="Task title"
        placeholder="Add a task"
        value={title}
        maxLength={MAX_TODO_TITLE_LENGTH}
        aria-invalid={Boolean(errors.title)}
        aria-describedby={errors.title ? `${idPrefix}-title-error` : undefined}
        onChange={(event) => setTitle(event.target.value)}
      />
      <input
        id={`${idPrefix}-estimate`}
        className="pixel-input todo-form__estimate"
        type="number"
        inputMode="numeric"
        aria-label="Estimate in pomodoros"
        placeholder="Pom"
        min={MIN_ESTIMATE}
        max={MAX_ESTIMATE}
        step={1}
        value={estimate}
        aria-invalid={Boolean(errors.estimatePomodoros)}
        aria-describedby={errors.estimatePomodoros ? `${idPrefix}-estimate-error` : undefined}
        onChange={(event) => setEstimate(event.target.value)}
      />
      <PixelButton variant="primary" size="small" type="submit" disabled={saving}>
        {submitLabel}
      </PixelButton>
      {onCancel && (
        <PixelButton size="small" onClick={onCancel}>
          Cancel
        </PixelButton>
      )}

      {errors.title && (
        <p id={`${idPrefix}-title-error`} className="pixel-error todo-form__error" role="alert">
          {errors.title}
        </p>
      )}
      {errors.estimatePomodoros && (
        <p id={`${idPrefix}-estimate-error`} className="pixel-error todo-form__error" role="alert">
          {errors.estimatePomodoros}
        </p>
      )}
    </form>
  );
}

export default TodoForm;
