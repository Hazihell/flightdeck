import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  DEFAULT_HOME_DIR_NAME,
  resolveFlightdeckHome,
} from "./home.ts";
import { createIsolatedFlightdeckHome } from "./testing/helpers.ts";

describe("resolveFlightdeckHome", () => {
  test("prefers FLIGHTDECK_HOME over platform home", async () => {
    const { home, env, platformHome } = await createIsolatedFlightdeckHome();
    expect(resolveFlightdeckHome(env, platformHome)).toBe(home);
    expect(home).not.toContain(DEFAULT_HOME_DIR_NAME);
  });

  test("defaults to ~/Flightdeck when override is unset", () => {
    const platformHome = "/Users/example";
    expect(resolveFlightdeckHome({}, platformHome)).toBe(
      join(platformHome, DEFAULT_HOME_DIR_NAME),
    );
  });
});
