import type { DatabaseSync } from 'node:sqlite';
import {
  AWAY_AFTER_SECONDS,
  MAX_AWAY_AFTER_SECONDS,
  MIN_AWAY_AFTER_SECONDS
} from '../../shared/session';

// Small settings kept as text in the `settings` table.

const AWAY_AFTER_KEY = 'awayAfterSeconds';

// A number setting, or the fallback if it was never set or the saved value is not in range.
export function getNumberSetting(
  db: DatabaseSync,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  if (!row) {
    return fallback;
  }

  const value = Number(row.value);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

// Saves a number setting. A value outside its range is refused instead of being saved.
export function setNumberSetting(
  db: DatabaseSync,
  key: string,
  value: number,
  min: number,
  max: number
): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`The value must be a number from ${min} to ${max}`);
  }

  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

// How many seconds without input make the person count as away.
export function getAwayAfterSeconds(db: DatabaseSync): number {
  return getNumberSetting(
    db,
    AWAY_AFTER_KEY,
    AWAY_AFTER_SECONDS,
    MIN_AWAY_AFTER_SECONDS,
    MAX_AWAY_AFTER_SECONDS
  );
}

export function setAwayAfterSeconds(db: DatabaseSync, seconds: number): void {
  setNumberSetting(db, AWAY_AFTER_KEY, seconds, MIN_AWAY_AFTER_SECONDS, MAX_AWAY_AFTER_SECONDS);
}
