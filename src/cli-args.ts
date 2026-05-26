export type ParsedArgs = {
  command: string[];
  flags: Map<string, string | boolean>;
  positional: string[];
};

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];
  const command: string[] = [];

  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (!token) {
      index += 1;
      continue;
    }

    if (token === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags.set(body.slice(0, eq), body.slice(eq + 1));
        index += 1;
        continue;
      }

      const next = argv[index + 1];
      if (next && !next.startsWith("-")) {
        flags.set(body, next);
        index += 2;
        continue;
      }

      flags.set(body, true);
      index += 1;
      continue;
    }

    if (command.length === 0) {
      command.push(token);
      index += 1;
      while (index < argv.length) {
        const sub = argv[index];
        if (!sub || sub.startsWith("-")) {
          break;
        }
        command.push(sub);
        index += 1;
      }
      continue;
    }

    positional.push(token);
    index += 1;
  }

  return { command, flags, positional };
}

export function flagString(
  flags: Map<string, string | boolean>,
  name: string,
): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function hasFlag(
  flags: Map<string, string | boolean>,
  name: string,
): boolean {
  return flags.has(name);
}
