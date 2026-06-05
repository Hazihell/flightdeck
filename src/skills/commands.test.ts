import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSkillInstall, runSkillInstructions } from "./commands.ts";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "flightdeck-skills-test-"));
}

describe("skill commands", () => {
  test("installs global skill into a skills root", async () => {
    const root = await tempDir();

    const result = await runSkillInstall({
      scope: "global",
      path: root,
      platformHome: root,
      cwd: root,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const skillPath = join(root, "flightdeck", "SKILL.md");
    expect(result.data.path).toBe(skillPath);
    const content = await readFile(skillPath, "utf8");
    expect(content).toContain("---\nname: flightdeck");
    expect(content).toContain("deck issue next --mode plan|implement|review|address-review");
    expect(content).toContain("to-prd");
    expect(content).toContain("to-issues");
    expect(content).toContain("import a markdown PRD file");
    expect(content).toContain("deck prd create --project <KEY>");
    expect(content).toContain("--prd <PRD_ID> --user-stories 1,3");
    expect(content).toContain("PRD link: product context and user story traceability");
    expect(content).toContain("`Parent`: issue hierarchy or source grouping only");
    expect(content).not.toContain("create one parent issue");
    expect(content).toContain("GitHub/Gitea/Jira/Linear/Obsidian");
  });

  test("installs project skill under a project root", async () => {
    const projectRoot = await tempDir();

    const result = await runSkillInstall({
      scope: "project",
      path: projectRoot,
      platformHome: projectRoot,
      cwd: projectRoot,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const skillPath = join(projectRoot, ".agents", "skills", "flightdeck", "SKILL.md");
    expect(result.data.path).toBe(skillPath);
    expect(existsSync(skillPath)).toBe(true);
  });

  test("does not overwrite an existing skill without force", async () => {
    const root = await tempDir();
    const skillPath = join(root, "flightdeck", "SKILL.md");
    await runSkillInstall({ scope: "global", path: root, platformHome: root, cwd: root });
    await writeFile(skillPath, "custom skill", "utf8");

    const result = await runSkillInstall({
      scope: "global",
      path: root,
      platformHome: root,
      cwd: root,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected install to fail");
    }
    expect(result.error.code).toBe("skill_exists");
    expect(await readFile(skillPath, "utf8")).toBe("custom skill");
  });

  test("overwrites an existing skill with force", async () => {
    const root = await tempDir();
    const skillPath = join(root, "flightdeck", "SKILL.md");
    await runSkillInstall({ scope: "global", path: root, platformHome: root, cwd: root });
    await writeFile(skillPath, "custom skill", "utf8");

    const result = await runSkillInstall({
      scope: "global",
      path: root,
      platformHome: root,
      cwd: root,
      force: true,
    });

    expect(result.ok).toBe(true);
    expect(await readFile(skillPath, "utf8")).toContain("# Flightdeck");
  });

  test("prints global instruction text", () => {
    const result = runSkillInstructions();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.data.text).toContain("## Flightdeck issue tracking");
    expect(result.data.text).toContain("invoke the `flightdeck` skill");
    expect(result.data.text).toContain("If another skill names another issue tracker");
    expect(result.data.text).toContain("Map `to-prd` to `deck prd create`");
    expect(result.data.text).toContain(
      "PRD-linked `deck issue create --prd <PRD_ID> --user-stories <NUMBERS>`",
    );
    expect(result.data.text).not.toContain(
      "deck issue next --mode plan|implement|review|address-review",
    );
  });
});
