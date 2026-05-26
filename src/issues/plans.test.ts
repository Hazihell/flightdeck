import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  closeDatabase,
  openDatabase,
} from "../db/client.ts";
import { findIssueByPublicId, selectNextIssue } from "../index.ts";
import { planRelativePath } from "../documents/repository.ts";
import { runDeck, setupInitializedHome } from "../testing/helpers.ts";

describe("plan commands", () => {
  test("stores plan markdown under Flightdeck Home only", async () => {
    const isolated = await setupInitializedHome();
    const { env, home } = isolated;
    const repoRoot = join(home, "fake-repo");
    await Bun.write(join(repoRoot, ".gitkeep"), "");

    await runDeck(
      ["project", "add", "--key", "PLN", "--name", "Plans", "--json"],
      isolated,
    );
    await runDeck(
      [
        "project",
        "path",
        "add",
        "--project",
        "PLN",
        "--path",
        repoRoot,
        "--json",
      ],
      isolated,
    );
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "PLN",
        "--title",
        "Complex",
        "--body",
        "## What to build\n\nBig feature",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "needs-plan",
        "--json",
      ],
      isolated,
    );

    const planMarkdown = "# Plan\n\n## Steps\n\n1. Do thing\n2. Verify";
    expect(
      await runDeck(
        ["issue", "attach-plan", "PLN-1", "--body", planMarkdown, "--json"],
        isolated,
      ),
    ).toBe(0);

    const relativePath = planRelativePath("PLN-1");
    const planPath = join(home, relativePath);
    expect(existsSync(planPath)).toBe(true);
    expect(await Bun.file(planPath).text()).toBe(planMarkdown);
    expect(existsSync(join(repoRoot, "plan.md"))).toBe(false);
    expect(existsSync(join(repoRoot, relativePath))).toBe(false);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issue = findIssueByPublicId(db, "PLN-1");
      expect(issue?.planStatus).toBe("attached");
      expect(selectNextIssue(db, "implement")).toBeNull();
    } finally {
      closeDatabase(db);
    }

    expect(
      await runDeck(["issue", "approve-plan", "PLN-1", "--json"], isolated),
    ).toBe(0);

    const db2 = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issue = findIssueByPublicId(db2, "PLN-1");
      expect(issue?.planStatus).toBe("approved");
      const next = selectNextIssue(db2, "implement");
      expect(next?.publicId).toBe("PLN-1");
    } finally {
      closeDatabase(db2);
    }
  });

  test("request-plan-changes returns issue to plan queue", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;

    await runDeck(
      ["project", "add", "--key", "RPC", "--name", "Plan changes", "--json"],
      isolated,
    );
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "RPC",
        "--title",
        "Complex",
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
      [
        "issue",
        "attach-plan",
        "RPC-1",
        "--body",
        "# Plan\n\nInitial",
        "--json",
      ],
      isolated,
    );
    await runDeck(["issue", "approve-plan", "RPC-1", "--json"], isolated);

    expect(
      await runDeck(
        [
          "issue",
          "request-plan-changes",
          "RPC-1",
          "--validation",
          "Add error handling",
          "--json",
        ],
        isolated,
      ),
    ).toBe(0);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issue = findIssueByPublicId(db, "RPC-1");
      expect(issue?.planStatus).toBe("changes-requested");
      expect(issue?.validationSummary).toBe("Add error handling");
      expect(selectNextIssue(db, "plan")?.publicId).toBe("RPC-1");
      expect(selectNextIssue(db, "implement")).toBeNull();
    } finally {
      closeDatabase(db);
    }
  });

  test("approve-plan fails without attached plan", async () => {
    const isolated = await setupInitializedHome();
    await runDeck(
      ["project", "add", "--key", "APR", "--name", "Approve", "--json"],
      isolated,
    );
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "APR",
        "--title",
        "No plan",
        "--body",
        "## What to build\n\nx",
        "--complexity",
        "needs-plan",
        "--json",
      ],
      isolated,
    );

    expect(
      await runDeck(["issue", "approve-plan", "APR-1", "--json"], isolated),
    ).toBe(1);
  });
});
