import { useState } from 'react';
import type { Goal } from '../../../shared/goal';
import type { RunState } from '../../../shared/run';
import { friendlyError } from '../lib/errors';
import { dayKindLabel, perkNotes, quotaSummary } from '../lib/runView';
import PerkDraft from './PerkDraft';
import PixelBar from './PixelBar';
import PixelButton from './PixelButton';
import PixelPanel from './PixelPanel';
import StageMap from './StageMap';

interface RunPanelProps {
  run: RunState;
  // The quest the run is for, if it is in the list.
  goal: Goal | undefined;
  onStartSession: (goal: Goal) => void;
}

// The active run on the dashboard: today's stage and quota, the stage map, the perks held, and
// the perk draft when a stage has just been cleared.
function RunPanel({ run, goal, onStartSession }: RunPanelProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const quota = quotaSummary(run);
  const stage = run.stages[run.stageIndex - 1];
  const notes = perkNotes(run);

  async function handleAbandon(): Promise<void> {
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    try {
      await window.api.run.abandon();
    } catch (error) {
      setMessage(friendlyError(error));
      setBusy(false);
    }
  }

  return (
    <>
      <PixelPanel title="Your run">
        <div className="pixel-stack">
          <p className="run-goal">{goal?.title ?? 'Your quest'}</p>
          <p className="run-stage">
            Stage {run.stageIndex} of {run.stages.length}. {dayKindLabel(stage.kind)}.
          </p>

          <PixelBar
            label="TODAY"
            kind="xp"
            value={quota.percent}
            max={100}
            valueText={`${quota.doneMinutes}/${quota.quotaMinutes} min`}
          />
          <p className="pixel-note">{quota.text}</p>

          <StageMap run={run} />

          {notes.length > 0 && <p className="run-perks">Perks: {notes.join(', ')}</p>}

          {message && (
            <p className="pixel-error" role="alert">
              {message}
            </p>
          )}

          <div className="pixel-row">
            {goal && (
              <PixelButton
                variant="primary"
                size="small"
                aria-label={`Start a session for ${goal.title}`}
                onClick={() => onStartSession(goal)}
              >
                Start session
              </PixelButton>
            )}

            {/* Ending a run takes two clicks, so a slip of the mouse cannot lose it. */}
            {confirming ? (
              <>
                <PixelButton size="small" variant="danger" disabled={busy} onClick={handleAbandon}>
                  Really end the run?
                </PixelButton>
                <PixelButton size="small" onClick={() => setConfirming(false)}>
                  Keep going
                </PixelButton>
              </>
            ) : (
              <PixelButton size="small" disabled={busy} onClick={() => setConfirming(true)}>
                End run
              </PixelButton>
            )}
          </div>
          <p className="pixel-note">Focus counts toward the quota when a session ends.</p>
        </div>
      </PixelPanel>

      <PerkDraft run={run} />
    </>
  );
}

export default RunPanel;
