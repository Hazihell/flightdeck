import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  closeDatabase,
  expectedSchemaVersion,
  getAppliedMigrationVersion,
  migrate,
  openDatabase,
} from "./client.ts";
import { flightdeckDatabasePath } from "../home.ts";
import { initFlightdeck } from "../init.ts";
import { createIsolatedFlightdeckHome } from "../testing/helpers.ts";

describe("database migrations", () => {
  test("applies migrations once and records schema version", async () => {
    const { home, env, platformHome } = await createIsolatedFlightdeckHome();
    const init = await initFlightdeck(env, platformHome);

    expect(init.schemaVersion).toBe(expectedSchemaVersion());
    expect(existsSync(flightdeckDatabasePath(home))).toBe(true);

    const db = openDatabase(home);
    try {
      expect(getAppliedMigrationVersion(db)).toBe(expectedSchemaVersion());
      const secondRun = migrate(db);
      expect(secondRun).toBe(expectedSchemaVersion());
      expect(getAppliedMigrationVersion(db)).toBe(expectedSchemaVersion());
    } finally {
      closeDatabase(db);
    }
  });
});
