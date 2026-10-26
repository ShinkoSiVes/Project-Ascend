import { useEffect, useState } from 'react';
import type { RunStats, RunStatus, RunSummary } from '../../../shared/run';
import { formatFocused } from '../lib/format';
import { runStatusLabel } from '../lib/runView';
import PixelPanel from './PixelPanel';

interface RunHistoryProps {
  // Changes whenever the list should be loaded again, for example when a run ends.
  refreshKey: string;
}

// The badge colour for each way a run can end.
const BADGE: Record<RunStatus, string> = {
  active: 'medium',
  failed: 'hard',
  completed: 'gentle',
  abandoned: 'medium'
};

// The lifetime numbers and the last few finished runs. They are read from what was saved, so a
// failed run never takes them away.
function RunHistory({ refreshKey }: RunHistoryProps): React.JSX.Element {
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([window.api.run.history(10), window.api.run.stats()])
      .then(([saved, totals]) => {
        if (!cancelled) {
          setHistory(saved);
          setStats(totals);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <PixelPanel title="Run history">
      <div className="pixel-stack">
        {stats && (
          <ul className="timer-facts">
            <li>Best stage reached: {stats.bestStage}</li>
            <li>
              Runs played: {stats.runsPlayed}, won: {stats.runsWon}
            </li>
            <li>Total focus time: {formatFocused(stats.totalFocusMs)}</li>
          </ul>
        )}

        {history.length === 0 ? (
          <p className="pixel-note">No finished runs yet.</p>
        ) : (
          <ul className="history-list">
            {history.map((run) => (
              <li key={run.id} className="history-item">
                <span className="history-item__title">{run.goalTitle}</span>
                <span className={`pixel-badge pixel-badge--${BADGE[run.status]}`}>
                  {runStatusLabel(run.status)}
                </span>
                <span className="history-item__detail">
                  Stage {run.stageReached} of {run.stagesTotal}, {run.stagesCleared} cleared
                </span>
                <span className="history-item__detail">
                  {run.startDay}
                  {run.endDay && run.endDay !== run.startDay ? ` to ${run.endDay}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PixelPanel>
  );
}

export default RunHistory;
