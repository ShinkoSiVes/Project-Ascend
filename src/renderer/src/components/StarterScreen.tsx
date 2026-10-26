import { useState, type FormEvent } from 'react';
import {
  MAX_PET_NAME_LENGTH,
  SPECIES,
  SPECIES_IDS,
  checkPetChoice,
  stageName,
  type PetChoiceErrors,
  type PetState,
  type SpeciesId
} from '../../../shared/pet';
import { friendlyError } from '../lib/errors';
import PetSprite from './PetSprite';
import PixelButton from './PixelButton';
import PixelPanel from './PixelPanel';

interface StarterScreenProps {
  onChosen: (pet: PetState) => void;
}

// The first screen a new player sees: pick one of the three starters and give it a name.
function StarterScreen({ onChosen }: StarterScreenProps): React.JSX.Element {
  const [species, setSpecies] = useState<SpeciesId>('ember');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<PetChoiceErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const input = { species, name };
    const found = checkPetChoice(input);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      onChosen(await window.api.pet.choose(input));
    } catch (error) {
      setSaveError(friendlyError(error));
      setSaving(false);
    }
  }

  return (
    <>
      <PixelPanel title="Welcome to Ascend">
        <p>Choose your first pet. It grows stronger every time you focus.</p>
      </PixelPanel>

      <PixelPanel title="Choose a starter">
        <form className="pixel-stack" onSubmit={handleSubmit} noValidate>
          <fieldset className="pixel-fieldset">
            <legend className="pixel-label">Starter</legend>
            <div className="pixel-choices">
              {SPECIES_IDS.map((id) => (
                <label key={id} className="pixel-choice">
                  <input
                    className="visually-hidden"
                    type="radio"
                    name="species"
                    value={id}
                    checked={species === id}
                    onChange={() => setSpecies(id)}
                  />
                  <span className={`pixel-choice__body pixel-choice__body--${id} starter-card`}>
                    <PetSprite
                      species={id}
                      stage={1}
                      mood="happy"
                      scale={6}
                      label={`${stageName(id, 1)}, a ${SPECIES[id].element} starter`}
                    />
                    <span className="pixel-choice__name">{stageName(id, 1)}</span>
                    <span className="pixel-choice__summary">{SPECIES[id].element} type</span>
                    <span className="pixel-choice__summary">{SPECIES[id].blurb}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="pixel-field">
            <label className="pixel-label" htmlFor="pet-name">
              Name your pet
            </label>
            <input
              id="pet-name"
              className="pixel-input"
              type="text"
              value={name}
              maxLength={MAX_PET_NAME_LENGTH}
              placeholder="Bean"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'pet-name-error' : undefined}
              onChange={(event) => {
                setName(event.target.value);
                // The old message no longer applies once the person starts fixing the name.
                setErrors((current) => ({ ...current, name: undefined }));
              }}
            />
            {errors.name && (
              <p id="pet-name-error" className="pixel-error" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          {saveError && (
            <p className="pixel-error" role="alert">
              {saveError}
            </p>
          )}

          <div className="pixel-row">
            <PixelButton variant="primary" type="submit" disabled={saving}>
              {saving ? 'Choosing...' : 'Start my journey'}
            </PixelButton>
          </div>
        </form>
      </PixelPanel>
    </>
  );
}

export default StarterScreen;
