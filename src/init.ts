import { closeDatabase, migrate, openDatabase } from "./db/client.ts";
import { ensureFlightdeckHome, flightdeckDatabasePath, resolveFlightdeckHome } from "./home.ts";

export type InitResult = {
  home: string;
  databasePath: string;
  schemaVersion: number;
};

export async function initFlightdeck(
  env: NodeJS.ProcessEnv,
  platformHome: string,
): Promise<InitResult> {
  const home = resolveFlightdeckHome(env, platformHome);
  await ensureFlightdeckHome(home);

  const db = openDatabase(home);
  try {
    const schemaVersion = migrate(db);
    return {
      home,
      databasePath: flightdeckDatabasePath(home),
      schemaVersion,
    };
  } finally {
    closeDatabase(db);
  }
}
