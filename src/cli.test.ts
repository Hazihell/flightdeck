import { describe, expect, test } from "bun:test";

import { HELP_TEXT, runCli } from "./cli.ts";

describe("deck CLI", () => {
  test("prints stable help text", async () => {
    const code = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(HELP_TEXT).toContain("deck init");
    expect(HELP_TEXT).toContain("deck project add");
    expect(HELP_TEXT).toContain("deck skill install");
    expect(HELP_TEXT).toContain("deck skill instructions");
  });

  test("returns non-zero for unknown commands", async () => {
    const code = await runCli(["not-a-command"]);
    expect(code).toBe(1);
  });
});
