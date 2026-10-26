import type { DatabaseSync } from 'node:sqlite';
import {
  checkPetChoice,
  petStateFrom,
  type PetRecord,
  type PetState,
  type SpeciesId,
  type XpSource
} from '../../shared/pet';

interface PetRow {
  species: string;
  name: string;
  chosen_at: string;
}

function toRecord(row: PetRow): PetRecord {
  return { species: row.species as SpeciesId, name: row.name, chosenAt: row.chosen_at };
}

// The chosen pet, or null before a starter has been picked.
export function getPetRecord(db: DatabaseSync): PetRecord | null {
  const row = db
    .prepare('SELECT species, name, chosen_at FROM pets WHERE id = 1')
    .get() as unknown as PetRow | undefined;
  return row ? toRecord(row) : null;
}

// Picks the starter. The renderer is untrusted, so the choice is checked first, and a second
// pet is refused.
export function choosePet(db: DatabaseSync, input: unknown): PetRecord {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid pet');
  }
  const fields = input as Record<string, unknown>;

  const [firstError] = Object.values(checkPetChoice(fields));
  if (firstError) {
    throw new Error(firstError);
  }
  if (getPetRecord(db)) {
    throw new Error('You already have a pet');
  }

  const row = db
    .prepare(
      'INSERT INTO pets (id, species, name) VALUES (1, ?, ?) RETURNING species, name, chosen_at'
    )
    .get(fields.species as string, (fields.name as string).trim()) as unknown as PetRow;
  return toRecord(row);
}

// Records an XP payout and returns true, or false if that source and reference already paid out.
export function addXp(db: DatabaseSync, source: XpSource, refId: number, amount: number): boolean {
  if (!Number.isInteger(amount) || amount <= 0) {
    return false;
  }

  const { changes } = db
    .prepare('INSERT OR IGNORE INTO xp_events (source, ref_id, amount) VALUES (?, ?, ?)')
    .run(source, refId, amount);
  return changes > 0;
}

// All the XP ever earned.
export function totalXp(db: DatabaseSync): number {
  const row = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM xp_events').get() as {
    total: number;
  };
  return row.total;
}

// The chosen pet with its progress, or null before a starter has been picked.
export function getPetState(db: DatabaseSync): PetState | null {
  const record = getPetRecord(db);
  return record ? petStateFrom(record, totalXp(db)) : null;
}
