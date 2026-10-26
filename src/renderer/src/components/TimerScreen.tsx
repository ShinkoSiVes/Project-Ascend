import { useState } from 'react';
import {
  elapsedMs,
  focusedMsSoFar,
  isPaused,
  pausesLeft,
  phaseDurationMs,
  remainingMs,
  type SessionState
} from '../../../shared/session';
import { advance } from '../../../shared/sessionEngine';
import { useNow } from '../hooks/useNow';
import { useSessionLabels } from '../hooks/useSessionLabels';
import { friendlyError } from '../lib/errors';
import { formatClock, formatFocused } from '../lib/format';
import { STRICTNESS_INFO, pauseRuleText } from '../lib/strictness';
import PixelBar from './PixelBar';
import PixelButton from './PixelButton';
import PixelPanel from './PixelPanel';
import RoundDots from './RoundDots';

interface TimerScreenProps {
  session: SessionState;
}

// The lock-in screen. The main process owns the session; this screen only shows it, deriving the
// countdown from the same pure engine so it stays smooth between the main process's updates.
function TimerScreen({ session }: TimerScreenProps): React.JSX.Element {
  const now = useNow(250);
  const { goalTitle, todoTitle } = useSessionLabels(session.goalId, session.todoId);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);

  // For display only: bring the state up to date with the clock. If that would end the session,
  // keep showing the last state until the main process announces the end.
  const advanced = advance(session, now);
  const view = advanced.phase === 'ended' ? session : advanced;

  // Runs one request to the main process and shows its message if it is refused.
  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleGiveUp(): Promise<void> {
    setConfirmingGiveUp(false);
    await run(() => window.api.session.abandon());
  }

  // A session that was created but not started, for example if starting failed.
  if (view.phase === 'prep') {
    return (
      <PixelPanel title="Ready">
        <div className="pixel-stack">
          <p>{goalTitle ?? 'Your session'} is prepared but has not started.</p>
          {message && (
            <p className="pixel-error" role="alert">
              {message}
            </p>
          )}
          <div className="pixel-row">
            <PixelButton
              variant="primary"
              disabled={busy}
              onClick={() => run(() => window.api.session.start())}
            >
              Start
            </PixelButton>
            <PixelButton disabled={busy} onClick={() => run(() => window.api.session.abandon())}>
              Cancel
            </PixelButton>
          </div>
        </div>
      </PixelPanel>
    );
  }

  const paused = isPaused(view);
  const onBreak = view.phase === 'break';
  const duration = phaseDurationMs(view);
  const elapsed = Math.min(elapsedMs(view, now), duration);
  const left = pausesLeft(view);
  const canPause = view.phase === 'focus' && !paused && left !== 0;
  const percent = duration > 0 ? Math.floor((elapsed / duration) * 100) : 0;
  const phaseLabel = paused ? 'Paused' : onBreak ? 'Break' : 'Focus';

  return (
    <div className="timer-screen">
      <PixelPanel>
        <div className="timer-header">
          <span className={`timer-phase timer-phase--${paused ? 'paused' : view.phase}`}>
            {phaseLabel}
          </span>
          <span className="timer-round">
            Round {view.round} of {view.config.rounds}
          </span>
        </div>

        <p className="timer-clock" role="timer" aria-label="Time left in this phase">
          {formatClock(remainingMs(view, now))}
        </p>

        {/* Announced to screen readers only when the phase or round changes, not every second. */}
        <p className="visually-hidden" aria-live="polite">
          {phaseLabel}, round {view.round} of {view.config.rounds}
        </p>

        <div className="pixel-stack">
          <PixelBar
            label="TIME"
            value={elapsed}
            max={duration}
            kind="xp"
            valueText={`${percent}%`}
          />
          <RoundDots total={view.config.rounds} round={view.round} phase={view.phase} />
        </div>
      </PixelPanel>

      <PixelPanel title="This session">
        <ul className="timer-facts">
          <li>Quest: {goalTitle ?? '...'}</li>
          {session.todoId !== null && <li>Task: {todoTitle ?? '...'}</li>}
          <li>Focused so far: {formatFocused(focusedMsSoFar(view, now))}</li>
          <li>
            Strictness: {STRICTNESS_INFO[view.config.strictness].label}.{' '}
            {pauseRuleText(view.config.strictness)}
            {left !== null && left > 0 ? ` (${left} left)` : ''}
          </li>
        </ul>
      </PixelPanel>

      {message && (
        <p className="pixel-error" role="alert">
          {message}
        </p>
      )}

      <div className="pixel-row">
        {paused ? (
          <PixelButton
            variant="primary"
            disabled={busy}
            onClick={() => run(() => window.api.session.resume())}
          >
            Resume
          </PixelButton>
        ) : (
          <PixelButton
            disabled={busy || !canPause}
            onClick={() => run(() => window.api.session.pause())}
          >
            Pause
          </PixelButton>
        )}

        {/* Giving up takes two clicks, so a slip of the mouse cannot end a session. */}
        {confirmingGiveUp ? (
          <>
            <PixelButton variant="danger" disabled={busy} onClick={handleGiveUp}>
              Really give up?
            </PixelButton>
            <PixelButton onClick={() => setConfirmingGiveUp(false)}>Keep going</PixelButton>
          </>
        ) : (
          <PixelButton disabled={busy} onClick={() => setConfirmingGiveUp(true)}>
            Give up
          </PixelButton>
        )}
      </div>
    </div>
  );
}

export default TimerScreen;
