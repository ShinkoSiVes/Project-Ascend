import { useState } from 'react';
import type { Goal } from '../../shared/goal';
import Dashboard from './components/Dashboard';
import PrepScreen from './components/PrepScreen';
import ResultScreen from './components/ResultScreen';
import TimerScreen from './components/TimerScreen';
import Versions from './components/Versions';
import { useSession } from './hooks/useSession';

// Chooses what to show. A running session takes over the whole window; otherwise the person
// is on the dashboard, or on the prep screen for the quest they picked.
function App(): React.JSX.Element {
  const { session, ready, dismiss } = useSession();
  const [prepGoal, setPrepGoal] = useState<Goal | null>(null);

  // Wait for the first answer from the main process, so a running session never flashes the dashboard.
  if (!ready) {
    return <p className="pixel-note">Loading...</p>;
  }

  if (session?.phase === 'ended') {
    return (
      <ResultScreen
        session={session}
        onDone={() => {
          dismiss();
          setPrepGoal(null);
        }}
      />
    );
  }

  if (session) {
    return <TimerScreen session={session} />;
  }

  if (prepGoal) {
    return <PrepScreen goal={prepGoal} onCancel={() => setPrepGoal(null)} />;
  }

  return (
    <>
      <Dashboard onStartSession={setPrepGoal} />
      <Versions></Versions>
    </>
  );
}

export default App;
