import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

function stripPrivatePrefix(path: string): string {
  if (path.startsWith("/private/")) {
    return path.slice("/private".length);
  }
  return path;
}

/** Normalizes a filesystem path for stable prefix matching. */
export function normalizePath(path: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    return stripPrivatePrefix(resolved);
  }
  return stripPrivatePrefix(realpathSync.native(resolved));
}

/**
 * Returns true when `cwd` is exactly `registered` or is a child of `registered`
 * (e.g. `/repo/app` under `/repo`, but not `/repo-other` under `/repo`).
 */
export function pathMatchesPrefix(cwd: string, registered: string): boolean {
  const normalizedCwd = normalizePath(cwd);
  const normalizedRegistered = normalizePath(registered);

  if (normalizedCwd === normalizedRegistered) {
    return true;
  }

  const prefix = normalizedRegistered.endsWith("/")
    ? normalizedRegistered
    : `${normalizedRegistered}/`;

  return normalizedCwd.startsWith(prefix);
}
