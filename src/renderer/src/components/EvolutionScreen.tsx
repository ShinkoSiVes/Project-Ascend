import { useEffect, useState } from 'react';
import { stageName, type PetState } from '../../../shared/pet';
import PetSprite from './PetSprite';
import PixelButton from './PixelButton';
import PixelPanel from './PixelPanel';

interface EvolutionScreenProps {
  pet: PetState;
  from: number;
  to: number;
  onContinue: () => void;
}

type Phase = 'before' | 'after';

const CHANGING_MS = 1600;

// The moment a pet grows: the old form flickers, then the new one bounces in. With reduced
// motion switched on, the new form is shown at once and nothing flickers.
function EvolutionScreen({ pet, from, to, onContinue }: EvolutionScreenProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'after' : 'before'
  );

  useEffect(() => {
    if (phase !== 'before') {
      return;
    }
    const timer = setTimeout(() => setPhase('after'), CHANGING_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const oldName = stageName(pet.species, from);
  const newName = stageName(pet.species, to);
  const done = phase === 'after';

  return (
    <PixelPanel title={done ? 'Evolution!' : 'What is happening?'}>
      <div className="pixel-stack">
        <div className={`evolution evolution--${phase}`}>
          <PetSprite
            species={pet.species}
            stage={done ? to : from}
            mood="happy"
            scale={10}
            label={`${pet.name} the ${done ? newName : oldName}`}
          />
        </div>
        <p className="evolution__text" role="status">
          {done ? `${oldName} evolved into ${newName}!` : `${pet.name} is changing...`}
        </p>
        {done && (
          <div className="pixel-row">
            <PixelButton variant="primary" onClick={onContinue}>
              Continue
            </PixelButton>
          </div>
        )}
      </div>
    </PixelPanel>
  );
}

export default EvolutionScreen;
