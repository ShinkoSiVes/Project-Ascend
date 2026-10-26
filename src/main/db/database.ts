import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrations';

// Opens the database file (or ':memory:' in tests), applies pending migrations and returns it.
export function openDatabase(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath);

  try {
    db.exec('PRAGMA foreign_keys = ON');
    // WAL keeps writes fast and safe after a crash; it does not apply to in-memory databases.
    if (filePath !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL');
    }
    runMigrations(db);
  } catch (error) {
    db.close();
    throw error;
  }

  return db;
}
