import { useState } from 'react';
import type { Goal } from '../../shared/goal';
import Dashboard from './components/Dashboard';
import EvolutionScreen from './components/EvolutionScreen';
import PrepScreen from './components/PrepScreen';
import ResultScreen from './components/ResultScreen';
import StarterScreen from './components/StarterScreen';
import TimerScreen from './components/TimerScreen';
import Versions from './components/Versions';
import { usePet } from './hooks/usePet';
import { useSession } from './hooks/useSession';

// Chooses what to show. A running session takes over the whole window. Otherwise a new player
// picks a starter first, a pet that just grew gets its evolution moment, and then the person is
// on the dashboard, or on the prep screen for the quest they picked.
function App(): React.JSX.Element {
  const { session, ready: sessionReady, dismiss } = useSession();
  const { pet, ready: petReady, gain, evolution, setPet, dismissEvolution } = usePet();
  const [prepGoal, setPrepGoal] = useState<Goal | null>(null);

  // Wait for the first answers from the main process, so nothing flashes the wrong screen.
  if (!sessionReady || !petReady) {
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

  if (!pet) {
    return <StarterScreen onChosen={setPet} />;
  }

  // The evolution waits until the session result has been read, then it is shown once.
  if (evolution) {
    return (
      <EvolutionScreen
        pet={pet}
        from={evolution.from}
        to={evolution.to}
        onContinue={dismissEvolution}
      />
    );
  }

  if (prepGoal) {
    return <PrepScreen goal={prepGoal} onCancel={() => setPrepGoal(null)} />;
  }

  return (
    <>
      <Dashboard pet={pet} gain={gain} onStartSession={setPrepGoal} />
      <Versions></Versions>
    </>
  );
}

export default App;
