import { MAX_DIFFICULTY, type Goal } from '../../../shared/goal';
import { STRICTNESS_INFO } from '../lib/strictness';
import PixelStar from './PixelStar';

interface GoalCardProps {
  goal: Goal;
}

// One saved goal, shown as a quest card.
function GoalCard({ goal }: GoalCardProps): React.JSX.Element {
  const created = new Date(goal.createdAt).toLocaleDateString();

  return (
    <li className="pixel-panel quest-card">
      <h3 className="quest-card__title">{goal.title}</h3>
      <div className="quest-card__stats">
        <span>{goal.targetHours} h</span>
        <span
          className="quest-card__stars"
          role="img"
          aria-label={`Difficulty ${goal.difficulty} of ${MAX_DIFFICULTY}`}
        >
          {Array.from({ length: MAX_DIFFICULTY }, (_, index) => (
            <PixelStar key={index} filled={index < goal.difficulty} />
          ))}
        </span>
        <span className={`pixel-badge pixel-badge--${goal.strictness}`}>
          {STRICTNESS_INFO[goal.strictness].label}
        </span>
      </div>
      <p className="quest-card__date">Created {created}</p>
    </li>
  );
}

export default GoalCard;
