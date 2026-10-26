// The pets, drawn in code as 16x16 pixel grids.
// In a grid, '.' is empty and every other letter is a colour from the species palette:
//   O outline, B body, S body shade, H body highlight, A accent, C accent highlight.
// The face is not part of the grid. It is drawn on top for each mood, so one body serves all three.

import type { PetMood, SpeciesId } from '../../../shared/pet';

export const SPRITE_SIZE = 16;

export interface FaceAnchor {
  // The row of the top of the eyes, and the column of the centre of each eye.
  eyeY: number;
  eyeXs: readonly [number, number];
  // The row and leftmost column of a 4 pixel wide mouth.
  mouthY: number;
  mouthX: number;
}

export interface Sprite {
  rows: readonly string[];
  face: FaceAnchor;
}

export interface Pixel {
  x: number;
  y: number;
  color: string;
}

export const PALETTES: Record<SpeciesId, Record<string, string>> = {
  ember: { O: '#5a1d1d', B: '#ff7a45', S: '#d94a2b', H: '#ffb070', A: '#ffd23f', C: '#fff3a8' },
  tide: { O: '#14325c', B: '#4db3ff', S: '#2b7fd1', H: '#9ee0ff', A: '#ffffff', C: '#c8f4ff' },
  leaf: { O: '#123d22', B: '#5be37d', S: '#2fa354', H: '#a6f5b5', A: '#1f9d4a', C: '#c9ff8a' }
};

// Colours for the face, shared by every species.
export const FACE_COLORS: Record<string, string> = { K: '#05060f', T: '#bfefff' };

const BABY_FACE: FaceAnchor = { eyeY: 8, eyeXs: [5, 10], mouthY: 10, mouthX: 6 };
const BIG_FACE: FaceAnchor = { eyeY: 8, eyeXs: [4, 11], mouthY: 10, mouthX: 6 };

// Indexed by species, then by stage minus one. The names are placeholders; so is the art, until
// real sprite sheets replace it.
export const SPRITES: Record<SpeciesId, readonly [Sprite, Sprite, Sprite]> = {
  ember: [
    {
      face: BABY_FACE,
      rows: [
        '................',
        '.......AA.......',
        '......ACCA......',
        '.......AA.......',
        '.....OOOOOO.....',
        '....OBBBBBBO....',
        '...OBHHBBBBBO...',
        '..OBBHBBBBBBBO..',
        '..OBBBBBBBBBBO..',
        '..OBBBBBBBBBBO..',
        '..OBBBBBBBBBBO..',
        '..OSBBBBBBBBSO..',
        '...OSSBBBBSSO...',
        '....OOSSSSOO....',
        '......OOOO......',
        '................'
      ]
    },
    {
      face: BIG_FACE,
      rows: [
        '.......AA.......',
        '......ACCA......',
        '..A..ACCCCA..A..',
        '..AA.AACCAA.AA..',
        '...OOOOOOOOOO...',
        '..OBBBBBBBBBBO..',
        '.OBHHBBBBBBBBBO.',
        '.OBHBBBBBBBBBBO.',
        '.OBBBBBBBBBBBBO.',
        '.OBBBBBBBBBBBBO.',
        '.OBBBBBBBBBBBBO.',
        '.OSBBBBBBBBBBSO.',
        '..OSBBBBBBBBSO..',
        '..OOSSBBBBSSOO..',
        '...OOOSSSSOOO...',
        '......OOOO......'
      ]
    },
    {
      face: BIG_FACE,
      rows: [
        '...A...AA...A...',
        '..AA..ACCA..AA..',
        '..ACA.ACCA.ACA..',
        '...ACAACCAACA...',
        '....OOOOOOOO....',
        '..OOBBBBBBBBOO..',
        '.OBHHBBBBBBBBBO.',
        '.OBHBBBBBBBBBBO.',
        'OBBBBBBBBBBBBBBO',
        'OBBBBBBBBBBBBBBO',
        'OBBBBBBBBBBBBBBO',
        'OSBBBBBBBBBBBBSO',
        '.OSBBBBBBBBBBSO.',
        '.OOSBBBBBBBBSOO.',
        '..OOSSBBBBSSOO..',
        '...OOO....OOO...'
      ]
    }
  ],
  tide: [
    {
      face: BABY_FACE,
      rows: [
        '................',
        '.......OO.......',
        '......OHBO......',
        '......OBBO......',
        '.....OBBBBO.....',
        '....OBHBBBBO....',
        '...OBHBBBBBBO...',
        '..OBBBBBBBBBBO..',
        '..OBBBBBBBBBBO..',
        '..OBBBBBBBBBBO..',
        '..OBBBBBBBBBBO..',
        '..OSBBBBBBBBSO..',
        '...OSSBBBBSSO...',
        '....OOSSSSOO....',
        '......OOOO......',
        '................'
      ]
    },
    {
      face: BIG_FACE,
      rows: [
        '.......AA.......',
        '......ACCA......',
        '....AACCCCAA....',
        '...ACCAAAACCA...',
        '...OOOOOOOOOO...',
        '..OBBBBBBBBBBO..',
        '.OBHHBBBBBBBBBO.',
        'AOBHBBBBBBBBBBOA',
        'AOBBBBBBBBBBBBOA',
        '.OBBBBBBBBBBBBO.',
        '.OBBBBBBBBBBBBO.',
        '.OSBBBBBBBBBBSO.',
        '..OSBBBBBBBBSO..',
        '..OOSSBBBBSSOO..',
        '...OOOSSSSOOO...',
        '......OOOO......'
      ]
    },
    {
      face: BIG_FACE,
      rows: [
        '..A....AA....A..',
        '.ACA..ACCA..ACA.',
        '.ACCAACCCCAACCA.',
        '..ACCCCAACCCCA..',
        '....OOOOOOOO....',
        '..OOBBBBBBBBOO..',
        '.OBHHBBBBBBBBBO.',
        'AOBHBBBBBBBBBBOA',
        'AOBBBBBBBBBBBBOA',
        'OBBBBBBBBBBBBBBO',
        'OBBBBBBBBBBBBBBO',
        'OSBBBBBBBBBBBBSO',
        '.OSBBBBBBBBBBSO.',
        '.OOSBBBBBBBBSOO.',
        '..OOSSBBBBSSOO..',
        '...OOO....OOO...'
      ]
    }
  ],
  leaf: [
    {
      face: { eyeY: 9, eyeXs: [5, 10], mouthY: 11, mouthX: 6 },
      rows: [
        '................',
        '....AA....AA....',
        '...ACCA..ACCA...',
        '...AACCAACCAA...',
        '.....AACCAA.....',
        '.....OOOOOO.....',
        '....OBBBBBBO....',
        '...OBHHBBBBBO...',
        '..OBBHBBBBBBBO..',
        '..OBBBBBBBBBBO..',
        '..OBBBBBBBBBBO..',
        '..OBBBBBBBBBBO..',
        '..OSBBBBBBBBSO..',
        '...OSSBBBBSSO...',
        '....OOSSSSOO....',
        '......OOOO......'
      ]
    },
    {
      face: BIG_FACE,
      rows: [
        '......A..A......',
        '....AAA..AAA....',
        '...ACCAAAACCA...',
        '....AACCCCAA....',
        '...OOOOOOOOOO...',
        '..OBBBBBBBBBBO..',
        '.OBHHBBBBBBBBBO.',
        '.OBHBBBBBBBBBBO.',
        'AOBBBBBBBBBBBBOA',
        'AOBBBBBBBBBBBBOA',
        '.OBBBBBBBBBBBBO.',
        '.OSBBBBBBBBBBSO.',
        '..OSBBBBBBBBSO..',
        '..OOSSBBBBSSOO..',
        '...OOOSSSSOOO...',
        '......OOOO......'
      ]
    },
    {
      face: BIG_FACE,
      rows: [
        '..A...AAAA...A..',
        '.ACA.ACCCCA.ACA.',
        '.ACCAACCCCAACCA.',
        '..ACCAAAAAACCA..',
        '....OOOOOOOO....',
        '..OOBBBBBBBBOO..',
        '.OBHHBBBBBBBBBO.',
        'AOBHBBBBBBBBBBOA',
        'AOBBBBBBBBBBBBOA',
        'OBBBBBBBBBBBBBBO',
        'OBBBBBBBBBBBBBBO',
        'OSBBBBBBBBBBBBSO',
        '.OSBBBBBBBBBBSO.',
        '.OOSBBBBBBBBSOO.',
        '..OOSSBBBBSSOO..',
        '...OOO....OOO...'
      ]
    }
  ]
};

interface FacePixel {
  x: number;
  y: number;
  key: 'K' | 'T';
}

// The eyes and mouth for a mood, as pixels placed relative to the sprite's face anchor.
//   happy:   closed, smiling eyes and a smile
//   neutral: plain dot eyes and a flat mouth
//   sad:     dot eyes with a tear under the left one, and a frown
export function facePixels(face: FaceAnchor, mood: PetMood): FacePixel[] {
  const { eyeY, eyeXs, mouthY, mouthX } = face;
  const pixels: FacePixel[] = [];
  const add = (x: number, y: number, key: 'K' | 'T' = 'K'): void => {
    pixels.push({ x, y, key });
  };

  for (const eyeX of eyeXs) {
    if (mood === 'happy') {
      add(eyeX, eyeY);
      add(eyeX - 1, eyeY + 1);
      add(eyeX + 1, eyeY + 1);
    } else {
      add(eyeX, eyeY);
      add(eyeX, eyeY + 1);
    }
  }

  if (mood === 'sad') {
    add(eyeXs[0], eyeY + 2, 'T');
  }

  if (mood === 'happy') {
    add(mouthX, mouthY);
    add(mouthX + 3, mouthY);
    add(mouthX + 1, mouthY + 1);
    add(mouthX + 2, mouthY + 1);
  } else if (mood === 'sad') {
    add(mouthX + 1, mouthY);
    add(mouthX + 2, mouthY);
    add(mouthX, mouthY + 1);
    add(mouthX + 3, mouthY + 1);
  } else {
    add(mouthX + 1, mouthY);
    add(mouthX + 2, mouthY);
  }

  return pixels;
}

// Every coloured pixel of a pet at a stage (1 to 3) and mood, with the face drawn over the body.
export function spritePixels(species: SpeciesId, stage: number, mood: PetMood): Pixel[] {
  const sprite = SPRITES[species][Math.min(Math.max(stage, 1), 3) - 1];
  const palette = PALETTES[species];
  const grid = new Map<string, string>();

  sprite.rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell !== '.') {
        grid.set(`${x},${y}`, palette[cell]);
      }
    });
  });

  for (const { x, y, key } of facePixels(sprite.face, mood)) {
    grid.set(`${x},${y}`, FACE_COLORS[key]);
  }

  return [...grid.entries()].map(([position, color]) => {
    const [x, y] = position.split(',').map(Number);
    return { x, y, color };
  });
}
