import { sessionXp } from '../../../shared/pet';
import type { SessionState } from '../../../shared/session';
import { useSessionLabels } from '../hooks/useSessionLabels';
import { formatFocused } from '../lib/format';
import PixelButton from './PixelButton';
import PixelPanel from './PixelPanel';

interface ResultScreenProps {
  // A session that has ended.
  session: SessionState;
  onDone: () => void;
}

// Shown when a session ends, whether it finished or was given up.
function ResultScreen({ session, onDone }: ResultScreenProps): React.JSX.Element {
  const { goalTitle, todoTitle } = useSessionLabels(session.goalId, session.todoId);
  const completed = session.endReason === 'completed';

  return (
    <PixelPanel title={completed ? 'Session complete' : 'Session ended early'}>
      <div className="pixel-stack">
        <ul className="timer-facts">
          <li>Quest: {goalTitle ?? '...'}</li>
          {session.todoId !== null && <li>Task: {todoTitle ?? '...'}</li>}
          <li>Focused: {formatFocused(session.focusedMs)}</li>
          <li>XP earned: +{sessionXp(session.focusedMs, completed)}</li>
          <li>
            Rounds reached: {session.round} of {session.config.rounds}
          </li>
        </ul>
        <p className="pixel-note">
          {completed
            ? 'Every round is done. Well locked in.'
            : 'The time you focused still counts. Come back when you are ready.'}
        </p>
        <div className="pixel-row">
          <PixelButton variant="primary" onClick={onDone}>
            Done
          </PixelButton>
        </div>
      </div>
    </PixelPanel>
  );
}

export default ResultScreen;
