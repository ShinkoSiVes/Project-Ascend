import { useMemo } from 'react';
import type { PetMood, SpeciesId } from '../../../shared/pet';
import { SPRITE_SIZE, spritePixels } from '../lib/sprites';

interface PetSpriteProps {
  species: SpeciesId;
  stage: number;
  mood: PetMood;
  // How many screen pixels each sprite pixel takes up.
  scale?: number;
  // What a screen reader says, for example "Bean the Cindrel, happy".
  label: string;
}

// A pet drawn from its pixel grid, with crisp edges at any size.
function PetSprite({ species, stage, mood, scale = 6, label }: PetSpriteProps): React.JSX.Element {
  const pixels = useMemo(() => spritePixels(species, stage, mood), [species, stage, mood]);
  const size = SPRITE_SIZE * scale;

  return (
    <svg
      className="pet-sprite"
      width={size}
      height={size}
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      {pixels.map(({ x, y, color }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color} />
      ))}
    </svg>
  );
}

export default PetSprite;
