import { PERKS, stageReached, stagesCleared, type RunState } from '../../../shared/run';
import { useSessionLabels } from '../hooks/useSessionLabels';
import StageMap from './StageMap';
import PixelButton from './PixelButton';
import PixelPanel from './PixelPanel';

interface RunResultScreenProps {
  // A run that failed or was won.
  run: RunState;
  onDone: () => void;
}

// Shown once when a run ends by failing or being won, even if it failed while the app was closed.
function RunResultScreen({ run, onDone }: RunResultScreenProps): React.JSX.Element {
  const { goalTitle } = useSessionLabels(run.goalId, null);
  const won = run.status === 'completed';
  const perks = run.perks.map((perk) => PERKS[perk].name);

  return (
    <PixelPanel title={won ? 'Run complete!' : 'Run failed'}>
      <div className="pixel-stack">
        <ul className="timer-facts">
          <li>Quest: {goalTitle ?? '...'}</li>
          <li>
            Stages cleared: {stagesCleared(run)} of {run.stages.length}
          </li>
          <li>
            {won ? 'Days played' : 'Reached stage'}: {won ? run.stages.length : stageReached(run)}
          </li>
          <li>Perks: {perks.length > 0 ? perks.join(', ') : 'none'}</li>
          <li>
            From {run.startDay} to {run.endDay ?? run.startDay}
          </li>
        </ul>

        <StageMap run={run} />

        <p className="pixel-note">
          {won
            ? 'You cleared every stage. Your pet keeps everything it grew.'
            : `The quota for stage ${stageReached(run)} was not met, so the run is over. Your pet keeps everything it grew, and a new run starts from stage 1.`}
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

export default RunResultScreen;
