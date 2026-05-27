import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_HOME_DIR_NAME = "Flightdeck";

/**
 * Resolves Flightdeck Home: `FLIGHTDECK_HOME` when set, otherwise `~/Flightdeck`.
 */
export function resolveFlightdeckHome(env: NodeJS.ProcessEnv, platformHome: string): string {
  const override = env.FLIGHTDECK_HOME?.trim();
  if (override) {
    return override;
  }
  return join(platformHome, DEFAULT_HOME_DIR_NAME);
}

export function flightdeckDatabasePath(home: string): string {
  return join(home, "flightdeck.sqlite");
}

/** Ensures Flightdeck Home exists on disk. */
export async function ensureFlightdeckHome(home: string): Promise<void> {
  await mkdir(home, { recursive: true });
}
