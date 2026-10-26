import { useEffect, useState, type FormEvent } from 'react';
import { SESSION_LIMITS } from '../../../shared/session';
import type { Goal, Strictness } from '../../../shared/goal';
import type { RunState } from '../../../shared/run';
import type { Todo } from '../../../shared/todo';
import { friendlyError } from '../lib/errors';
import {
  SESSION_NUMBER_KEYS,
  buildSessionConfig,
  defaultFormNumbers,
  type SessionFormNumbers,
  type SessionNumberKey
} from '../lib/sessionForm';
import { sessionRunHint } from '../lib/runView';
import { pauseRuleText } from '../lib/strictness';
import NumberField from './NumberField';
import PixelButton from './PixelButton';
import PixelPanel from './PixelPanel';
import StrictnessPicker from './StrictnessPicker';

interface PrepScreenProps {
  goal: Goal;
  // The active run, so the screen can say whether this session counts toward its quota.
  run: RunState | null;
  onCancel: () => void;
}

// What each setting counts, shown after its label. Settings that count rounds need no unit.
const NUMBER_UNITS: Record<SessionNumberKey, string | undefined> = {
  focusMinutes: 'min',
  breakMinutes: 'min',
  longBreakMinutes: 'min',
  longBreakEvery: undefined,
  rounds: undefined
};

// The preparation screen: choose the task, the strictness and the Pomodoro lengths, then start.
// Starting creates the session in the main process, which then pushes it to the whole app.
function PrepScreen({ goal, run, onCancel }: PrepScreenProps): React.JSX.Element {
  const runHint = sessionRunHint(run, goal.id);
  const [tasks, setTasks] = useState<Todo[]>([]);
  const [todoId, setTodoId] = useState('');
  const [strictness, setStrictness] = useState<Strictness>(goal.strictness);
  const [numbers, setNumbers] = useState<SessionFormNumbers>(defaultFormNumbers);
  const [errors, setErrors] = useState<Partial<Record<SessionNumberKey, string>>>({});
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Only unfinished tasks can be worked on. The list is a nicety, so a failure leaves it empty.
  useEffect(() => {
    let cancelled = false;

    window.api.todos
      .list(goal.id)
      .then((saved) => {
        if (!cancelled) {
          setTasks(saved.filter((task) => !task.done));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [goal.id]);

  async function handleStart(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const { config, errors: found } = buildSessionConfig(numbers, strictness);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setStarting(true);
    setStartError(null);
    try {
      await window.api.session.create({
        goalId: goal.id,
        todoId: todoId === '' ? null : Number(todoId),
        config
      });
      await window.api.session.start();
      // The main process now pushes the running session, and the app switches to the timer.
    } catch (error) {
      setStartError(friendlyError(error));
      setStarting(false);
    }
  }

  return (
    <>
      <PixelPanel title="Prepare your session">
        <div className="pixel-stack">
          <p className="prep-goal">{goal.title}</p>
          {runHint && <p className="pixel-note">{runHint}</p>}
        </div>
      </PixelPanel>

      <PixelPanel title="Setup">
        <form className="pixel-stack" onSubmit={handleStart} noValidate>
          <div className="pixel-field">
            <label className="pixel-label" htmlFor="prep-task">
              Task
            </label>
            <select
              id="prep-task"
              className="pixel-input"
              value={todoId}
              onChange={(event) => setTodoId(event.target.value)}
            >
              <option value="">No specific task</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>

          <StrictnessPicker value={strictness} onChange={setStrictness} />
          <p className="pixel-note">{pauseRuleText(strictness)}</p>

          <div className="prep-grid">
            {SESSION_NUMBER_KEYS.map((key) => (
              <NumberField
                key={key}
                id={`prep-${key}`}
                label={SESSION_LIMITS[key].label}
                unit={NUMBER_UNITS[key]}
                min={SESSION_LIMITS[key].min}
                max={SESSION_LIMITS[key].max}
                value={numbers[key]}
                error={errors[key]}
                onChange={(value) => setNumbers((current) => ({ ...current, [key]: value }))}
              />
            ))}
          </div>

          {startError && (
            <p className="pixel-error" role="alert">
              {startError}
            </p>
          )}

          <div className="pixel-row">
            <PixelButton variant="primary" type="submit" disabled={starting}>
              {starting ? 'Starting...' : 'Start session'}
            </PixelButton>
            <PixelButton onClick={onCancel} disabled={starting}>
              Cancel
            </PixelButton>
          </div>
        </form>
      </PixelPanel>
    </>
  );
}

export default PrepScreen;
