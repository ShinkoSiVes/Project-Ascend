import { MAX_DIFFICULTY, MIN_DIFFICULTY } from '../../../shared/goal';
import PixelStar from './PixelStar';

interface StarRatingProps {
  name: string;
  legend: string;
  value: number;
  onChange: (value: number) => void;
}

// Radio buttons drawn as stars, so the arrow keys and screen readers work for free.
function StarRating({ name, legend, value, onChange }: StarRatingProps): React.JSX.Element {
  const options = Array.from(
    { length: MAX_DIFFICULTY - MIN_DIFFICULTY + 1 },
    (_, index) => MIN_DIFFICULTY + index
  );

  return (
    <fieldset className="pixel-fieldset">
      <legend className="pixel-label">{legend}</legend>
      <div className="star-rating">
        {options.map((option) => (
          <label key={option} className="star-rating__option">
            <input
              className="visually-hidden"
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span className="visually-hidden">
              {option} {option === 1 ? 'star' : 'stars'}
            </span>
            <PixelStar filled={option <= value} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default StarRating;
