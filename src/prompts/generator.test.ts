import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { normalizePath } from "../projects/paths.ts";
import { parseDeckJson, runDeck, setupInitializedHome } from "../testing/helpers.ts";
import { PROMPT_SECTIONS } from "./contracts.ts";

async function setupProjectWithIssueAndPrd() {
  const isolated = await setupProjectWithIssue();

  await runDeck(
    [
      "issue",
      "create",
      "--project",
      "PRM",
      "--title",
      "PRD linked issue",
      "--body",
      "## What to build\n\nBuild the widget\n\n## Acceptance criteria\n\n- [ ] Tests pass",
      "--triage-role",
      "ready-for-agent",
      "--complexity",
      "simple",
      "--json",
    ],
    isolated,
  );

  await runDeck(
    [
      "prd",
      "create",
      "--project",
      "PRM",
      "--title",
      "Widget PRD",
      "--body",
      "## User Stories\n\n1. As a user, I want a widget.\n2. As a user, I want it fast.\n\n## Full detail\n\nThis is the distinctive PRD body line.",
      "--json",
    ],
    isolated,
  );

  await runDeck(
    ["issue", "link-prd", "PRM-1", "--prd", "PRM-PRD-1", "--user-stories", "1,2,99", "--json"],
    isolated,
  );

  return isolated;
}

async function captureJsonPromptForIssue(
  isolated: Awaited<ReturnType<typeof setupProjectWithIssue>>,
  issueId: string,
  mode: string,
): Promise<string> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const code = await runDeck(["issue", "prompt", issueId, "--mode", mode, "--json"], isolated);
    expect(code).toBe(0);
    const parsed = parseDeckJson<{ prompt?: string }>(lines.join("\n"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      return parsed.data.prompt ?? "";
    }
    return "";
  } finally {
    console.log = originalLog;
  }
}

async function setupProjectWithIssue() {
  const isolated = await setupInitializedHome();

  const repoRoot = normalizePath(join(isolated.home, "repo"));
  await mkdir(repoRoot, { recursive: true });

  await runDeck(
    [
      "project",
      "add",
      "--key",
      "PRM",
      "--name",
      "Prompts",
      "--instructions",
      "Use Bun and keep tests green.",
      "--json",
    ],
    isolated,
  );
  await runDeck(
    ["project", "path", "add", "--project", "PRM", "--path", repoRoot, "--json"],
    isolated,
  );

  return { ...isolated, repoRoot };
}

async function captureJsonPrompt(
  isolated: Awaited<ReturnType<typeof setupProjectWithIssue>>,
  mode: string,
): Promise<string> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const code = await runDeck(["issue", "prompt", "PRM-1", "--mode", mode, "--json"], isolated);
    expect(code).toBe(0);
    const parsed = parseDeckJson<{ prompt?: string }>(lines.join("\n"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      return parsed.data.prompt ?? "";
    }
    return "";
  } finally {
    console.log = originalLog;
  }
}

describe("issue prompts", () => {
  test("all modes include stable sections and required context", async () => {
    const isolated = await setupProjectWithIssue();
    const { repoRoot } = isolated;

    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "PRM",
        "--title",
        "Prompt target",
        "--body",
        "## What to build\n\nBuild the widget\n\n## Acceptance criteria\n\n- [ ] Tests pass\n- [ ] Widget renders",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "simple",
        "--json",
      ],
      isolated,
    );

    for (const mode of ["plan", "implement", "review", "address-review"] as const) {
      const prompt = await captureJsonPrompt(isolated, mode);
      expect(prompt).toContain(PROMPT_SECTIONS.projectContext);
      expect(prompt).toContain(PROMPT_SECTIONS.repositoryPath);
      expect(prompt).toContain(PROMPT_SECTIONS.issueBody);
      expect(prompt).toContain(PROMPT_SECTIONS.modeInstructions);
      expect(prompt).toContain(PROMPT_SECTIONS.requiredCommands);
      expect(prompt).toContain("Use Bun and keep tests green.");
      expect(prompt).toContain("Build the widget");
      expect(prompt).toContain(repoRoot);
      expect(prompt).toContain("deck issue move PRM-1");
    }
  });

  test("implement mode fails for needs-plan without approved plan", async () => {
    const isolated = await setupProjectWithIssue();

    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "PRM",
        "--title",
        "Needs plan",
        "--body",
        "## What to build\n\nComplex",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "needs-plan",
        "--json",
      ],
      isolated,
    );

    const lines: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      const code = await runDeck(
        ["issue", "prompt", "PRM-1", "--mode", "implement", "--json"],
        isolated,
      );
      expect(code).toBe(1);
      const output = lines.join("\n");
      expect(output).toContain("plan_not_approved");
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });

  test("implement prompt includes plan content after approval", async () => {
    const isolated = await setupProjectWithIssue();

    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "PRM",
        "--title",
        "Planned work",
        "--body",
        "## What to build\n\nFeature\n\n## Acceptance criteria\n\n- [ ] Ships",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "needs-plan",
        "--json",
      ],
      isolated,
    );

    await runDeck(
      ["issue", "attach-plan", "PRM-1", "--body", "## Implementation plan\n\nStep one", "--json"],
      isolated,
    );
    await runDeck(["issue", "approve-plan", "PRM-1", "--json"], isolated);

    const prompt = await captureJsonPrompt(isolated, "implement");
    expect(prompt).toContain(PROMPT_SECTIONS.issuePlan);
    expect(prompt).toContain("Step one");
    expect(prompt).toContain(PROMPT_SECTIONS.acceptanceCriteria);
    expect(prompt).toContain("Ships");
  });

  test("plan prompt after request-plan-changes includes validation feedback", async () => {
    const isolated = await setupProjectWithIssue();

    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "PRM",
        "--title",
        "Revised plan",
        "--body",
        "## What to build\n\nFeature",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "needs-plan",
        "--json",
      ],
      isolated,
    );

    await runDeck(
      ["issue", "attach-plan", "PRM-1", "--body", "# Plan\n\nInitial draft", "--json"],
      isolated,
    );
    await runDeck(["issue", "approve-plan", "PRM-1", "--json"], isolated);
    await runDeck(
      ["issue", "request-plan-changes", "PRM-1", "--validation", "Add error handling", "--json"],
      isolated,
    );

    const prompt = await captureJsonPrompt(isolated, "plan");
    expect(prompt).toContain(PROMPT_SECTIONS.reviewContext);
    expect(prompt).toContain("Add error handling");
    expect(prompt).toContain("revise the attached plan");
  });

  test("first-time plan prompt omits review context without plan changes", async () => {
    const isolated = await setupProjectWithIssue();

    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "PRM",
        "--title",
        "Fresh plan",
        "--body",
        "## What to build\n\nFeature",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "needs-plan",
        "--json",
      ],
      isolated,
    );

    const prompt = await captureJsonPrompt(isolated, "plan");
    expect(prompt).not.toContain(PROMPT_SECTIONS.reviewContext);
  });

  test("address-review prompt includes validation summary and comments", async () => {
    const isolated = await setupProjectWithIssue();

    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "PRM",
        "--title",
        "Review fixes",
        "--body",
        "## What to build\n\nFix tests",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "simple",
        "--json",
      ],
      isolated,
    );

    await runDeck(
      [
        "issue",
        "move",
        "PRM-1",
        "--status",
        "changes-requested",
        "--validation",
        "Add regression coverage for queue overlap",
        "--json",
      ],
      isolated,
    );

    await runDeck(
      [
        "issue",
        "comment",
        "PRM-1",
        "--body",
        "Please cover the address-review queue case explicitly.",
        "--json",
      ],
      isolated,
    );

    const prompt = await captureJsonPrompt(isolated, "address-review");
    expect(prompt).toContain(PROMPT_SECTIONS.reviewContext);
    expect(prompt).toContain("Add regression coverage for queue overlap");
    expect(prompt).toContain("Please cover the address-review queue case explicitly.");
  });

  test("linked PRD: all modes include prdContext section with PRD metadata", async () => {
    const isolated = await setupProjectWithIssueAndPrd();

    for (const mode of ["plan", "implement", "review", "address-review"] as const) {
      const prompt = await captureJsonPromptForIssue(isolated, "PRM-1", mode);
      expect(prompt).toContain(PROMPT_SECTIONS.prdContext);
      expect(prompt).toContain("PRM-PRD-1");
      expect(prompt).toContain("Widget PRD");
    }
  });

  test("linked PRD: covered story text appears for linked numbers", async () => {
    const isolated = await setupProjectWithIssueAndPrd();

    const prompt = await captureJsonPromptForIssue(isolated, "PRM-1", "plan");
    expect(prompt).toContain("1. As a user, I want a widget.");
    expect(prompt).toContain("2. As a user, I want it fast.");
  });

  test("linked PRD: missing story reference shows missing note", async () => {
    const isolated = await setupProjectWithIssueAndPrd();

    const prompt = await captureJsonPromptForIssue(isolated, "PRM-1", "plan");
    expect(prompt).toContain("99. (not found in PRD)");
    expect(prompt).toContain("Missing user story references: 99 (not found in PRD body)");
  });

  test("linked PRD: full PRD body is included", async () => {
    const isolated = await setupProjectWithIssueAndPrd();

    const prompt = await captureJsonPromptForIssue(isolated, "PRM-1", "plan");
    expect(prompt).toContain("This is the distinctive PRD body line.");
  });

  test("unlinked issue: prompt does not contain prdContext", async () => {
    const isolated = await setupProjectWithIssue();

    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "PRM",
        "--title",
        "No PRD",
        "--body",
        "## What to build\n\nOrphan",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "simple",
        "--json",
      ],
      isolated,
    );

    const prompt = await captureJsonPromptForIssue(isolated, "PRM-1", "plan");
    expect(prompt).not.toContain(PROMPT_SECTIONS.prdContext);
  });

  test("prompt text matches snapshot sections for plan mode", async () => {
    const isolated = await setupProjectWithIssue();

    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "PRM",
        "--title",
        "Snapshot",
        "--body",
        "## What to build\n\nSnap",
        "--json",
      ],
      isolated,
    );

    const prompt = await captureJsonPrompt(isolated, "plan");
    const stablePrompt = prompt.replace(
      /^## Repository path\n\n.+$/m,
      "## Repository path\n\n<REPO_PATH>",
    );
    expect(stablePrompt).toMatchSnapshot();
  });
});
