// The pet: its species, evolution stages and how it earns XP.
// Everything here is plain data and pure functions, shared by the main process and the renderer.

export const SPECIES_IDS = ['ember', 'tide', 'leaf'] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

export interface Species {
  id: SpeciesId;
  element: string;
  // One name per evolution stage: baby, teen, final.
  stageNames: readonly [string, string, string];
  blurb: string;
}

// The three starters. The names are placeholders and can be changed freely.
export const SPECIES: Record<SpeciesId, Species> = {
  ember: {
    id: 'ember',
    element: 'Fire',
    stageNames: ['Sparkit', 'Cindrel', 'Pyrovane'],
    blurb: 'A warm little flame that grows brighter the longer you stay locked in.'
  },
  tide: {
    id: 'tide',
    element: 'Water',
    stageNames: ['Dripple', 'Wavelet', 'Tidalon'],
    blurb: 'A calm drop of the sea that deepens with every steady session.'
  },
  leaf: {
    id: 'leaf',
    element: 'Plant',
    stageNames: ['Sproutle', 'Thornling', 'Verdantus'],
    blurb: 'A patient seedling that thrives on a little progress every day.'
  }
};

export const MAX_PET_NAME_LENGTH = 20;

// Total XP needed to reach each stage: stage 1 from the start, stage 2 at 300, stage 3 at 1200.
// About 5 and 20 focused hours.
export const EVOLUTION_XP = [0, 300, 1200] as const;
export const FINAL_STAGE = EVOLUTION_XP.length;

export const XP_PER_FOCUS_MINUTE = 1;
export const XP_TASK_COMPLETE = 25;
export const XP_SESSION_COMPLETE = 50;

// Where XP comes from. Each source and reference pays out at most once.
export const XP_SOURCES = ['session', 'task'] as const;
export type XpSource = (typeof XP_SOURCES)[number];

// The pet a person chose.
export interface PetRecord {
  species: SpeciesId;
  name: string;
  chosenAt: string;
}

// The pet together with how far along it is.
export interface PetState extends PetRecord {
  // 1 (baby), 2 (teen) or 3 (final).
  stage: number;
  xp: number;
  // XP earned inside the current stage, and how much the stage needs. null at the final stage.
  xpIntoStage: number;
  xpForStage: number | null;
}

// What the main process tells the window after XP is earned.
export interface PetUpdate {
  pet: PetState;
  gained: number;
  evolved: boolean;
}

export type PetChoiceErrors = Partial<Record<'species' | 'name', string>>;

// Checks the starter choice and returns a message per invalid field.
export function checkPetChoice(input: Record<string, unknown>): PetChoiceErrors {
  const { species, name } = input;
  const errors: PetChoiceErrors = {};

  if (typeof species !== 'string' || !(SPECIES_IDS as readonly string[]).includes(species)) {
    errors.species = 'Choose one of the starters';
  }
  if (
    typeof name !== 'string' ||
    name.trim().length < 1 ||
    name.trim().length > MAX_PET_NAME_LENGTH
  ) {
    errors.name = `Name must be 1 to ${MAX_PET_NAME_LENGTH} characters`;
  }

  return errors;
}

// Which stage a given amount of total XP reaches.
export function stageForXp(xp: number): number {
  let stage = 1;
  for (let next = 2; next <= FINAL_STAGE; next++) {
    if (xp >= EVOLUTION_XP[next - 1]) {
      stage = next;
    }
  }
  return stage;
}

// The species name of the pet at a stage, for example "Cindrel" for a teen Ember.
export function stageName(species: SpeciesId, stage: number): string {
  const names = SPECIES[species].stageNames;
  return names[Math.min(Math.max(stage, 1), FINAL_STAGE) - 1];
}

// Adds the progress information to a chosen pet and its total XP.
export function petStateFrom(record: PetRecord, xp: number): PetState {
  const total = Math.max(0, Math.floor(xp));
  const stage = stageForXp(total);

  if (stage >= FINAL_STAGE) {
    return {
      ...record,
      stage,
      xp: total,
      xpIntoStage: total - EVOLUTION_XP[stage - 1],
      xpForStage: null
    };
  }

  const stageStart = EVOLUTION_XP[stage - 1];
  return {
    ...record,
    stage,
    xp: total,
    xpIntoStage: total - stageStart,
    xpForStage: EVOLUTION_XP[stage] - stageStart
  };
}

// The XP a finished session pays: one per whole focused minute, plus a bonus for completing it.
// An abandoned session still pays for the minutes that were focused.
export function sessionXp(focusedMs: number, completed: boolean): number {
  const minutes = Math.floor(Math.max(0, focusedMs) / 60_000);
  return minutes * XP_PER_FOCUS_MINUTE + (completed ? XP_SESSION_COMPLETE : 0);
}
