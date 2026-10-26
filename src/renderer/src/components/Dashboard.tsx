import { useEffect, useState } from 'react';
import type { Goal } from '../../../shared/goal';
import type { PetState } from '../../../shared/pet';
import type { XpGain } from '../hooks/usePet';
import GoalCard from './GoalCard';
import GoalForm from './GoalForm';
import PetPanel from './PetPanel';
import PixelPanel from './PixelPanel';

type LoadStatus = 'loading' | 'ready' | 'error';

interface DashboardProps {
  pet: PetState;
  gain: XpGain | null;
  onStartSession: (goal: Goal) => void;
}

// The home screen: your pet, a form to create a quest (goal), and the quests already saved.
function Dashboard({ pet, gain, onStartSession }: DashboardProps): React.JSX.Element {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

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

  return (
    <>
      <PixelPanel title="Project: Ascend">
        <p>Pick a quest, then lock in.</p>
      </PixelPanel>

      <PetPanel pet={pet} gain={gain} />

      <PixelPanel title="New quest">
        <GoalForm onCreated={handleCreated} />
      </PixelPanel>

      <PixelPanel title="Your quests">
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
              <GoalCard key={goal.id} goal={goal} onStartSession={onStartSession} />
            ))}
          </ul>
        )}
      </PixelPanel>
    </>
  );
}

export default Dashboard;
