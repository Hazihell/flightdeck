import { Database } from "bun:sqlite";

import { flightdeckDatabasePath } from "../home.ts";
import { nowIso } from "../time.ts";
import { MIGRATIONS, SCHEMA_VERSION } from "./schema.ts";

export type { Database };

export function openDatabase(home: string): Database {
  const path = flightdeckDatabasePath(home);
  const db = new Database(path, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function getAppliedMigrationVersion(db: Database): number {
  const table = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get();
  if (!table) {
    return 0;
  }

  const row = db
    .query<{ version: number | null }, []>("SELECT MAX(version) AS version FROM schema_migrations")
    .get();
  return row?.version ?? 0;
}

export function migrate(db: Database): number {
  const current = getAppliedMigrationVersion(db);
  let applied = current;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) {
      continue;
    }
    db.exec("BEGIN;");
    try {
      db.exec(migration.sql);
      db.query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        nowIso(),
      );
      db.exec("COMMIT;");
      applied = migration.version;
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }

  return applied;
}

export function withTransaction<T>(db: Database, fn: () => T): T {
  db.exec("BEGIN;");
  try {
    const result = fn();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function closeDatabase(db: Database): void {
  db.close();
}

export function expectedSchemaVersion(): number {
  return SCHEMA_VERSION;
}
