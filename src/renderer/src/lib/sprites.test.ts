import { describe, expect, it } from 'vitest';
import { SPECIES_IDS, type PetMood } from '../../../shared/pet';
import { FACE_COLORS, PALETTES, SPRITES, SPRITE_SIZE, facePixels, spritePixels } from './sprites';

const MOODS: PetMood[] = ['happy', 'neutral', 'sad'];
const STAGES = [1, 2, 3];

// Every sprite as a labelled case, so a failure names the species and stage.
const cases = SPECIES_IDS.flatMap((species) =>
  STAGES.map((stage) => ({
    label: `${species} stage ${stage}`,
    species,
    stage,
    sprite: SPRITES[species][stage - 1]
  }))
);

describe('sprite grids', () => {
  it('has all nine forms', () => {
    expect(cases).toHaveLength(9);
  });

  it.each(cases)('$label is a 16x16 grid', ({ sprite }) => {
    expect(sprite.rows).toHaveLength(SPRITE_SIZE);
    for (const row of sprite.rows) {
      expect(row).toHaveLength(SPRITE_SIZE);
    }
  });

  it.each(cases)('$label only uses colours from its palette', ({ species, sprite }) => {
    const allowed = new Set(['.', ...Object.keys(PALETTES[species])]);
    const used = new Set(sprite.rows.flatMap((row) => [...row]));

    for (const letter of used) {
      expect(allowed.has(letter), `unknown letter "${letter}"`).toBe(true);
    }
  });

  it.each(cases)('$label has a real body, not an empty grid', ({ sprite }) => {
    const filled = sprite.rows.flatMap((row) => [...row].filter((cell) => cell !== '.'));

    expect(filled.length).toBeGreaterThan(60);
  });

  // The highlight (H) is drawn on the left to suggest light from the top left, so it is the one
  // letter that is allowed to break the symmetry of the shape.
  it.each(cases)('$label has a symmetric shape', ({ sprite }) => {
    const shape = sprite.rows.map((row) => row.replaceAll('H', 'B'));
    const mirrored = shape.map((row) => [...row].reverse().join(''));

    expect(shape).toEqual(mirrored);
  });

  it('gives every palette the six body and accent colours', () => {
    for (const species of SPECIES_IDS) {
      expect(Object.keys(PALETTES[species]).sort()).toEqual(['A', 'B', 'C', 'H', 'O', 'S']);
    }
  });
});

describe('faces', () => {
  it.each(cases.flatMap((c) => MOODS.map((mood) => ({ ...c, mood }))))(
    '$label draws the $mood face on the body',
    ({ sprite, mood }) => {
      for (const { x, y } of facePixels(sprite.face, mood)) {
        const cell = sprite.rows[y]?.[x];
        expect(cell, `face pixel (${x}, ${y}) is outside the grid`).toBeDefined();
        expect(cell, `face pixel (${x}, ${y}) is not on the body`).not.toBe('.');
        expect(cell, `face pixel (${x}, ${y}) is on the outline`).not.toBe('O');
      }
    }
  );

  it.each(cases)('$label has a face that is symmetric around the middle', ({ sprite }) => {
    const [left, right] = sprite.face.eyeXs;

    // The two eye centres sit the same distance from the middle (7.5) of the 16 pixel grid.
    expect(7.5 - left).toBe(right - 7.5);
    // A 4 pixel mouth that starts at mouthX is centred too.
    expect(sprite.face.mouthX + 1.5).toBe(7.5);
  });

  it('draws a different face for each mood', () => {
    const face = SPRITES.ember[0].face;
    const keys = MOODS.map((mood) => JSON.stringify(facePixels(face, mood)));

    expect(new Set(keys).size).toBe(3);
  });

  it('only gives the sad face a tear', () => {
    const face = SPRITES.tide[0].face;

    expect(facePixels(face, 'sad').some((pixel) => pixel.key === 'T')).toBe(true);
    expect(facePixels(face, 'happy').some((pixel) => pixel.key === 'T')).toBe(false);
    expect(facePixels(face, 'neutral').some((pixel) => pixel.key === 'T')).toBe(false);
  });

  it('draws two eyes and a mouth for every mood', () => {
    const face = SPRITES.leaf[1].face;

    // Neutral: 2 eye pixels each side plus a 2 pixel mouth.
    expect(facePixels(face, 'neutral')).toHaveLength(6);
    // Happy: 3 eye pixels each side plus a 4 pixel smile.
    expect(facePixels(face, 'happy')).toHaveLength(10);
    // Sad: 2 eye pixels each side, a tear, and a 4 pixel frown.
    expect(facePixels(face, 'sad')).toHaveLength(9);
  });
});

describe('spritePixels', () => {
  it('draws the face over the body, using the face colours', () => {
    const pixels = spritePixels('ember', 1, 'happy');
    const colours = new Set(pixels.map((pixel) => pixel.color));

    expect(colours.has(FACE_COLORS.K)).toBe(true);
    expect(colours.has(PALETTES.ember.B)).toBe(true);
  });

  it('never has two pixels at the same position', () => {
    for (const { species, stage } of cases) {
      for (const mood of MOODS) {
        const pixels = spritePixels(species, stage, mood);
        const positions = pixels.map(({ x, y }) => `${x},${y}`);

        expect(new Set(positions).size).toBe(positions.length);
      }
    }
  });

  it('differs between moods, but only inside the face', () => {
    const happy = spritePixels('leaf', 2, 'happy');
    const sad = spritePixels('leaf', 2, 'sad');

    expect(happy).not.toEqual(sad);
    const bodyOf = (pixels: typeof happy): string[] =>
      pixels
        .filter(({ color }) => !Object.values(FACE_COLORS).includes(color))
        .map(({ x, y }) => `${x},${y}`);
    expect(bodyOf(happy).filter((position) => !bodyOf(sad).includes(position)).length).toBeLessThan(
      15
    );
  });

  it('looks different for every stage and species', () => {
    const looks = cases.map(({ species, stage }) =>
      JSON.stringify(spritePixels(species, stage, 'neutral'))
    );

    expect(new Set(looks).size).toBe(9);
  });

  it('keeps every pixel inside the grid', () => {
    for (const { species, stage } of cases) {
      for (const { x, y } of spritePixels(species, stage, 'sad')) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(SPRITE_SIZE);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(SPRITE_SIZE);
      }
    }
  });

  it('stays inside the three stages for an out-of-range stage', () => {
    expect(spritePixels('ember', 0, 'happy')).toEqual(spritePixels('ember', 1, 'happy'));
    expect(spritePixels('ember', 9, 'happy')).toEqual(spritePixels('ember', 3, 'happy'));
  });
});
