import { useState, type FormEvent } from 'react';
import {
  checkGoal,
  MAX_TARGET_HOURS,
  MAX_TITLE_LENGTH,
  MIN_TARGET_HOURS,
  type Goal,
  type GoalErrors,
  type Strictness
} from '../../../shared/goal';
import PixelButton from './PixelButton';
import StarRating from './StarRating';
import StrictnessPicker from './StrictnessPicker';

interface GoalFormProps {
  onCreated: (goal: Goal) => void;
}

const DEFAULT_DIFFICULTY = 3;
const DEFAULT_STRICTNESS: Strictness = 'medium';

// The "new quest" form. It checks the fields with the same rules as the main process,
// so mistakes show up next to the field instead of as a failed save.
function GoalForm({ onCreated }: GoalFormProps): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY);
  const [strictness, setStrictness] = useState<Strictness>(DEFAULT_STRICTNESS);
  const [errors, setErrors] = useState<GoalErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const input = { title, targetHours: Number(hours), difficulty, strictness };
    const found = checkGoal(input);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const goal = await window.api.goals.create(input);
      onCreated(goal);

      // Clear the form for the next quest.
      setTitle('');
      setHours('');
      setDifficulty(DEFAULT_DIFFICULTY);
      setStrictness(DEFAULT_STRICTNESS);
    } catch {
      setSaveError('Could not save the quest. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="pixel-stack" onSubmit={handleSubmit} noValidate>
      <div className="pixel-field">
        <label className="pixel-label" htmlFor="goal-title">
          What are you working on?
        </label>
        <input
          id="goal-title"
          className="pixel-input"
          type="text"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="Finish chapter 3"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? 'goal-title-error' : undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
        {errors.title && (
          <p id="goal-title-error" className="pixel-error" role="alert">
            {errors.title}
          </p>
        )}
      </div>

      <div className="pixel-field">
        <label className="pixel-label" htmlFor="goal-hours">
          Target hours
        </label>
        <input
          id="goal-hours"
          className="pixel-input"
          type="number"
          inputMode="decimal"
          min={MIN_TARGET_HOURS}
          max={MAX_TARGET_HOURS}
          step={0.5}
          value={hours}
          placeholder="10"
          aria-invalid={Boolean(errors.targetHours)}
          aria-describedby={errors.targetHours ? 'goal-hours-error' : undefined}
          onChange={(event) => setHours(event.target.value)}
        />
        {errors.targetHours && (
          <p id="goal-hours-error" className="pixel-error" role="alert">
            {errors.targetHours}
          </p>
        )}
      </div>

      <StarRating
        name="difficulty"
        legend="Difficulty"
        value={difficulty}
        onChange={setDifficulty}
      />
      <StrictnessPicker value={strictness} onChange={setStrictness} />

      {saveError && (
        <p className="pixel-error" role="alert">
          {saveError}
        </p>
      )}

      <div className="pixel-row">
        <PixelButton variant="primary" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Create quest'}
        </PixelButton>
      </div>
    </form>
  );
}

export default GoalForm;
