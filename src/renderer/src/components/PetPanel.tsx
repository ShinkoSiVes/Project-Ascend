import { SPECIES, moodFor, stageName, FINAL_STAGE, type PetState } from '../../../shared/pet';
import type { XpGain } from '../hooks/usePet';
import { useNow } from '../hooks/useNow';
import { moodText } from '../lib/petText';
import PetSprite from './PetSprite';
import PixelBar from './PixelBar';
import PixelPanel from './PixelPanel';

interface PetPanelProps {
  pet: PetState;
  // XP just earned, shown for a few seconds.
  gain: XpGain | null;
}

// The pet on the dashboard: its face, its stage, and how close it is to growing.
function PetPanel({ pet, gain }: PetPanelProps): React.JSX.Element {
  // The mood depends on how long ago the last focus was, so it is checked once a minute.
  const now = useNow(60_000);
  const mood = moodFor(pet, now);
  const formName = stageName(pet.species, pet.stage);
  const atFinalStage = pet.xpForStage === null;

  return (
    <PixelPanel title="Your pet">
      <div className="pet-panel">
        <PetSprite
          species={pet.species}
          stage={pet.stage}
          mood={mood}
          scale={7}
          label={`${pet.name} the ${formName}, looking ${mood}`}
        />
        <div className="pet-panel__info">
          <p className="pet-panel__name">
            {pet.name}
            {gain && (
              <span key={gain.key} className="pet-panel__gain" role="status">
                +{gain.amount} XP
              </span>
            )}
          </p>
          <p className="pet-panel__species">
            {formName}, {SPECIES[pet.species].element} type. Stage {pet.stage} of {FINAL_STAGE}
          </p>
          <p className="pixel-note">{moodText(pet.name, mood)}</p>
          <PixelBar
            label="XP"
            kind="xp"
            value={atFinalStage ? 1 : pet.xpIntoStage}
            max={atFinalStage ? 1 : (pet.xpForStage ?? 1)}
            valueText={atFinalStage ? `MAX ${pet.xp}` : `${pet.xpIntoStage}/${pet.xpForStage}`}
          />
        </div>
      </div>
    </PixelPanel>
  );
}

export default PetPanel;
