import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrations, runMigrations, type Migration } from './migrations';

function userVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

function tableNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  return rows.map((row) => row.name).sort();
}

describe('runMigrations', () => {
  it('creates the schema on a fresh database', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);

    expect(userVersion(db)).toBe(migrations[migrations.length - 1].version);
    expect(tableNames(db)).toEqual(['goals', 'sessions', 'settings', 'todos']);
  });

  it('upgrades a version 2 database without losing goals or tasks', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db, migrations.slice(0, 2));
    db.prepare(
      "INSERT INTO goals (title, target_hours, difficulty, strictness) VALUES ('old goal', 2, 3, 'hard')"
    ).run();
    db.prepare("INSERT INTO todos (goal_id, title, position) VALUES (1, 'old task', 1)").run();
    expect(userVersion(db)).toBe(2);

    runMigrations(db);

    expect(userVersion(db)).toBe(3);
    expect(tableNames(db)).toContain('sessions');
    expect((db.prepare('SELECT title FROM goals').get() as { title: string }).title).toBe(
      'old goal'
    );
    expect((db.prepare('SELECT title FROM todos').get() as { title: string }).title).toBe(
      'old task'
    );
  });

  it('upgrades a version 1 database without losing its goals', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db, [migrations[0]]);
    db.prepare(
      "INSERT INTO goals (title, target_hours, difficulty, strictness) VALUES ('old goal', 2, 3, 'hard')"
    ).run();
    expect(userVersion(db)).toBe(1);

    runMigrations(db);

    expect(userVersion(db)).toBe(migrations[migrations.length - 1].version);
    expect(tableNames(db)).toContain('todos');
    const goal = db.prepare('SELECT title FROM goals').get() as { title: string };
    expect(goal.title).toBe('old goal');
  });

  it('does nothing when run twice', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.prepare(
      "INSERT INTO goals (title, target_hours, difficulty, strictness) VALUES ('keep me', 1, 1, 'gentle')"
    ).run();

    runMigrations(db);

    const count = db.prepare('SELECT COUNT(*) AS n FROM goals').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('applies only the migrations newer than the current version', () => {
    const db = new DatabaseSync(':memory:');
    const first: Migration = { version: 1, sql: 'CREATE TABLE a (id INTEGER)' };
    const second: Migration = { version: 2, sql: 'CREATE TABLE b (id INTEGER)' };

    runMigrations(db, [first]);
    runMigrations(db, [first, second]);

    expect(userVersion(db)).toBe(2);
    expect(tableNames(db)).toEqual(['a', 'b']);
  });

  it('rolls back a failing migration and keeps the old version', () => {
    const db = new DatabaseSync(':memory:');
    const good: Migration = { version: 1, sql: 'CREATE TABLE a (id INTEGER)' };
    const bad: Migration = {
      version: 2,
      sql: 'CREATE TABLE b (id INTEGER); CREATE TABLE a (id INTEGER)'
    };

    expect(() => runMigrations(db, [good, bad])).toThrow();

    expect(userVersion(db)).toBe(1);
    expect(tableNames(db)).toEqual(['a']);
  });

  it('keeps shipped versions unique and ascending', () => {
    const versions = migrations.map((m) => m.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
  });
});
