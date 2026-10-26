import { useState } from 'react';
import { MAX_DIFFICULTY, type Goal } from '../../../shared/goal';
import { STRICTNESS_INFO } from '../lib/strictness';
import PixelButton from './PixelButton';
import PixelStar from './PixelStar';
import TodoList from './TodoList';

interface GoalCardProps {
  goal: Goal;
}

// One saved goal, shown as a quest card with its task list one click away.
function GoalCard({ goal }: GoalCardProps): React.JSX.Element {
  const [showTasks, setShowTasks] = useState(false);
  const created = new Date(goal.createdAt).toLocaleDateString();
  const tasksId = `tasks-${goal.id}`;

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

      <div>
        <PixelButton
          size="small"
          aria-expanded={showTasks}
          aria-controls={tasksId}
          onClick={() => setShowTasks((open) => !open)}
        >
          {showTasks ? 'Hide tasks' : 'Show tasks'}
        </PixelButton>
      </div>
      {showTasks && (
        <div id={tasksId}>
          <TodoList goalId={goal.id} />
        </div>
      )}
    </li>
  );
}

export default GoalCard;
