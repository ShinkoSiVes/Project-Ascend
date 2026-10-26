import { useState } from 'react';
import { MAX_DIFFICULTY, type Goal } from '../../../shared/goal';
import { STRICTNESS_INFO } from '../lib/strictness';
import PixelButton from './PixelButton';
import PixelStar from './PixelStar';
import TodoList from './TodoList';

interface GoalCardProps {
  goal: Goal;
  // The quest the active run is for, or null when there is no active run.
  runGoalId: number | null;
  onStartSession: (goal: Goal) => void;
  onStartRun: (goal: Goal) => void;
}

// One saved goal, shown as a quest card with its task list one click away.
function GoalCard({
  goal,
  runGoalId,
  onStartSession,
  onStartRun
}: GoalCardProps): React.JSX.Element {
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
        {runGoalId === goal.id && <span className="pixel-badge pixel-badge--run">Run active</span>}
      </div>
      <p className="quest-card__date">Created {created}</p>

      <div className="pixel-row">
        <PixelButton
          variant="primary"
          size="small"
          aria-label={`Start a session for ${goal.title}`}
          onClick={() => onStartSession(goal)}
        >
          Start session
        </PixelButton>
        {/* Only one run can be active, so the button is gone while one is. */}
        {runGoalId === null && (
          <PixelButton
            size="small"
            aria-label={`Start a run for ${goal.title}`}
            title="Plan one stage a day, each with a focus quota"
            onClick={() => onStartRun(goal)}
          >
            Start run
          </PixelButton>
        )}
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
