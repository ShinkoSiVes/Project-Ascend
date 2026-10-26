import { useEffect, useState } from 'react';
import type { Goal } from '../../../shared/goal';
import GoalCard from './GoalCard';
import GoalForm from './GoalForm';
import PixelPanel from './PixelPanel';

type LoadStatus = 'loading' | 'ready' | 'error';

// The home screen: create a quest (goal) and see the ones you already saved.
function Dashboard(): React.JSX.Element {
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
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </ul>
        )}
      </PixelPanel>
    </>
  );
}

export default Dashboard;
