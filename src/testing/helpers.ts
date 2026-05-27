import { spawnSync } from "node:child_process";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "../cli.ts";
import { initFlightdeck } from "../init.ts";

export type IsolatedHome = {
  home: string;
  env: NodeJS.ProcessEnv;
  platformHome: string;
};

/** Creates an isolated temporary Flightdeck Home for tests. */
export async function createIsolatedFlightdeckHome(): Promise<IsolatedHome> {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "flightdeck-test-")));
  const home = join(parent, "home");
  const platformHome = join(parent, "platform");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FLIGHTDECK_HOME: home,
  };
  return { home, env, platformHome };
}

/** Creates an isolated home and runs `deck init`. */
export async function setupInitializedHome(): Promise<IsolatedHome> {
  const isolated = await createIsolatedFlightdeckHome();
  await initFlightdeck(isolated.env, isolated.platformHome);
  return isolated;
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BUN_EXECUTABLE = process.versions.bun ? process.execPath : "bun";

export function deckSpawnArgs(argv: string[]): string[] {
  return [BUN_EXECUTABLE, "run", join(REPO_ROOT, "src", "cli.ts"), ...argv];
}

export function deckExecutable(): string[] {
  return deckSpawnArgs([]);
}

/** Runs `deck` in a subprocess (mirrors real CLI invocation). */
export function spawnDeck(
  argv: string[],
  env: NodeJS.ProcessEnv,
): { exitCode: number; stdout: string; stderr: string } {
  const proc = spawnSync(deckSpawnArgs(argv)[0]!, deckSpawnArgs(argv).slice(1), {
    env,
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return {
    exitCode: proc.status ?? 1,
    stdout: proc.stdout,
    stderr: proc.stderr,
  };
}

/** Runs `deck` via `runCli` (in-process, same as most unit tests). */
export async function runDeck(
  argv: string[],
  isolated: Pick<IsolatedHome, "env" | "platformHome">,
): Promise<number> {
  return runCli(argv, isolated.env, isolated.platformHome);
}

export type DeckJsonResponse<T = Record<string, unknown>> =
  | { ok: true; command?: string; data: T }
  | { ok: false; command?: string; error: { code: string; message: string } };

/** Parses the last JSON line from CLI stdout. */
export function parseDeckJson<T = Record<string, unknown>>(output: string): DeckJsonResponse<T> {
  const jsonLine = output
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .at(-1);
  if (!jsonLine) {
    throw new Error(`No JSON output found in:\n${output}`);
  }
  return JSON.parse(jsonLine) as DeckJsonResponse<T>;
}

/** Spawns `deck` with `--json` and returns parsed output. */
export function spawnDeckJson<T = Record<string, unknown>>(
  argv: string[],
  env: NodeJS.ProcessEnv,
): { exitCode: number; response: DeckJsonResponse<T>; raw: string } {
  const args = argv.includes("--json") ? argv : [...argv, "--json"];
  const { exitCode, stdout } = spawnDeck(args, env);
  return {
    exitCode,
    response: parseDeckJson<T>(stdout),
    raw: stdout,
  };
}
