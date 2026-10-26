import type { RunState } from '../../../shared/run';
import { stageMarkers } from '../lib/runView';

interface StageMapProps {
  run: RunState;
}

// The path of the run, one square per stage: finished stages, today's stage, and what is ahead.
// Boss days are marked B and rest days R.
function StageMap({ run }: StageMapProps): React.JSX.Element {
  return (
    <div className="stage-map-wrap">
      <ol className="stage-map" aria-label="Stage map">
        {stageMarkers(run).map((marker) => (
          <li
            key={marker.index}
            className={`stage-marker stage-marker--${marker.state} stage-marker--${marker.kind}`}
            aria-label={marker.label}
            title={marker.label}
          >
            <span aria-hidden="true">{marker.index}</span>
            {marker.kind !== 'normal' && (
              <span className="stage-marker__tag" aria-hidden="true">
                {marker.kind === 'boss' ? 'B' : 'R'}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="pixel-note stage-map__legend">
        B is a boss day with a bigger quota. R is a lighter rest day.
      </p>
    </div>
  );
}

export default StageMap;
