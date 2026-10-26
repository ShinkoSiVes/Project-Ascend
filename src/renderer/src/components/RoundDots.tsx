import type { Phase } from '../../../shared/session';

interface RoundDotsProps {
  total: number;
  // The round in progress, counting from 1.
  round: number;
  phase: Phase;
}

// One square per round: finished rounds are filled, the current one is highlighted.
function RoundDots({ total, round, phase }: RoundDotsProps): React.JSX.Element {
  return (
    <div className="round-dots" role="img" aria-label={`Round ${round} of ${total}`}>
      {Array.from({ length: total }, (_, index) => {
        const number = index + 1;
        // A round is finished once its break has started, or a later round has begun.
        const finished = number < round || (number === round && phase === 'break');
        const current = number === round && phase === 'focus';
        const state = finished ? 'done' : current ? 'current' : 'todo';
        return <span key={number} className={`round-dot round-dot--${state}`} />;
      })}
    </div>
  );
}

export default RoundDots;
