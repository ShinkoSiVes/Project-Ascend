import { STRICTNESS_LEVELS, type Strictness } from '../../../shared/goal';
import { STRICTNESS_INFO } from '../lib/strictness';

interface StrictnessPickerProps {
  value: Strictness;
  onChange: (value: Strictness) => void;
}

// Three radio cards, one per strictness level, each with a short explanation.
function StrictnessPicker({ value, onChange }: StrictnessPickerProps): React.JSX.Element {
  return (
    <fieldset className="pixel-fieldset">
      <legend className="pixel-label">Strictness</legend>
      <div className="pixel-choices">
        {STRICTNESS_LEVELS.map((level) => (
          <label key={level} className="pixel-choice">
            <input
              className="visually-hidden"
              type="radio"
              name="strictness"
              value={level}
              checked={value === level}
              onChange={() => onChange(level)}
            />
            <span className={`pixel-choice__body pixel-choice__body--${level}`}>
              <span className="pixel-choice__name">{STRICTNESS_INFO[level].label}</span>
              <span className="pixel-choice__summary">{STRICTNESS_INFO[level].summary}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default StrictnessPicker;
