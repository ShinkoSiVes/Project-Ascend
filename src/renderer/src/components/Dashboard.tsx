import { useEffect, useState } from 'react';
import type { Goal } from '../../../shared/goal';
import type { PetState } from '../../../shared/pet';
import type { RunState } from '../../../shared/run';
import type { XpGain } from '../hooks/usePet';
import { friendlyError } from '../lib/errors';
import GoalCard from './GoalCard';
import GoalForm from './GoalForm';
import PetPanel from './PetPanel';
import PixelPanel from './PixelPanel';
import RunHistory from './RunHistory';
import RunPanel from './RunPanel';

type LoadStatus = 'loading' | 'ready' | 'error';

interface DashboardProps {
  pet: PetState;
  gain: XpGain | null;
  // The active run, or null when there is none.
  run: RunState | null;
  onStartSession: (goal: Goal) => void;
}

// The home screen: your pet, the active run, a form to create a quest (goal), the quests already
// saved, and the history of past runs.
function Dashboard({ pet, gain, run, onStartSession }: DashboardProps): React.JSX.Element {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [runError, setRunError] = useState<string | null>(null);

  // Load the saved goals once. The flag stops a late answer from updating an unmounted screen.
  useEffect(() => {
    let cancelled = false;

    window.api.goals
      .list()
      .then((saved) => {
        if (!cancelled) {
          setGoals(saved);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // New quests go to the top, matching the newest-first order from the database.
  function handleCreated(goal: Goal): void {
    setGoals((current) => [goal, ...current]);
  }

  // Starts a run for the quest. The new run comes back through the app's listener, so the run
  // panel appears by itself.
  async function handleStartRun(goal: Goal): Promise<void> {
    setRunError(null);
    try {
      await window.api.run.start(goal.id);
    } catch (error) {
      setRunError(friendlyError(error));
    }
  }

  const runGoal = run ? goals.find((goal) => goal.id === run.goalId) : undefined;
  // The history is loaded again whenever a run starts or ends.
  const historyKey = run ? `active-${run.startDay}` : 'none';

  return (
    <>
      <PixelPanel title="Project: Ascend">
        <p>Pick a quest, then lock in.</p>
      </PixelPanel>

      <PetPanel pet={pet} gain={gain} />

      {run && <RunPanel run={run} goal={runGoal} onStartSession={onStartSession} />}

      <PixelPanel title="New quest">
        <GoalForm onCreated={handleCreated} />
      </PixelPanel>

      <PixelPanel title="Your quests">
        {runError && (
          <p className="pixel-error" role="alert">
            {runError}
          </p>
        )}
        {status === 'loading' && <p className="pixel-note">Loading...</p>}
        {status === 'error' && (
          <p className="pixel-error" role="alert">
            Could not load your quests. Restart the app and try again.
          </p>
        )}
        {status === 'ready' && goals.length === 0 && (
          <p className="pixel-note">No quests yet. Create your first one above.</p>
        )}
        {status === 'ready' && goals.length > 0 && (
          <ul className="quest-list">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                runGoalId={run ? run.goalId : null}
                onStartSession={onStartSession}
                onStartRun={handleStartRun}
              />
            ))}
          </ul>
        )}
      </PixelPanel>

      <RunHistory refreshKey={historyKey} />
    </>
  );
}

export default Dashboard;
