import type { DatabaseSync } from 'node:sqlite';

// Runs the work in a transaction: it all commits, or, if anything throws, none of it does.
// SQLite cannot nest transactions, so the work must not call another function that uses this.
export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
