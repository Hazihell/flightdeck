import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { closeDatabase, openDatabase } from "./db/client.ts";
import { planRelativePath } from "./documents/repository.ts";
import { findIssueByPublicId } from "./index.ts";
import { parseDeckJson, runDeck, setupInitializedHome, spawnDeckJson } from "./testing/helpers.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "testing", "fixtures");
const ISSUE_PATH = join(FIXTURES, "issue.md");
const PLAN_PATH = join(FIXTURES, "plan.md");

describe("end-to-end workflow", () => {
  test("init through project, issue, plan, implement, review, and done", async () => {
    const isolated = await setupInitializedHome();
    const { env, home } = isolated;

    expect(await runDeck(["init", "--json"], isolated)).toBe(0);

    expect(
      await runDeck(
        [
          "project",
          "add",
          "--key",
          "E2E",
          "--name",
          "E2E App",
          "--instructions",
          "Keep changes minimal and run tests.",
          "--json",
        ],
        isolated,
      ),
    ).toBe(0);

    const repoRoot = join(home, "repos", "e2e-app");
    await mkdir(repoRoot, { recursive: true });

    expect(
      await runDeck(
        [
          "project",
          "path",
          "add",
          "--project",
          "E2E",
          "--path",
          repoRoot,
          "--label",
          "main",
          "--json",
        ],
        isolated,
      ),
    ).toBe(0);

    const issueBody = await readFile(ISSUE_PATH, "utf8");
    const createOut = spawnDeckJson(
      [
        "issue",
        "create",
        "--project",
        "E2E",
        "--title",
        "Greeting banner",
        "--body",
        ISSUE_PATH,
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "needs-plan",
      ],
      env,
    );
    expect(createOut.exitCode).toBe(0);
    expect(createOut.response.ok).toBe(true);
    if (!createOut.response.ok) {
      throw new Error(createOut.response.error.message);
    }
    const publicId = String(createOut.response.data.publicId);
    expect(publicId).toBe("E2E-1");

    const dbAfterCreate = openDatabase(home);
    try {
      const issue = findIssueByPublicId(dbAfterCreate, publicId);
      expect(issue?.bodyMarkdown).toBe(issueBody);
      expect(issue?.complexity).toBe("needs-plan");
      expect(issue?.planStatus).toBe("none");
    } finally {
      closeDatabase(dbAfterCreate);
    }

    const planNext = spawnDeckJson(["issue", "next", "--mode", "plan", "--project", "E2E"], env);
    expect(planNext.exitCode).toBe(0);
    expect(planNext.response.ok).toBe(true);
    if (!planNext.response.ok) {
      throw new Error(planNext.response.error.message);
    }
    const planIssue = planNext.response.data.issue as {
      publicId: string;
    } | null;
    expect(planIssue?.publicId).toBe(publicId);

    const planMarkdown = await readFile(PLAN_PATH, "utf8");
    expect(
      await runDeck(["issue", "attach-plan", publicId, "--body", PLAN_PATH, "--json"], isolated),
    ).toBe(0);

    const planFile = join(home, planRelativePath(publicId));
    expect(existsSync(planFile)).toBe(true);
    expect(await readFile(planFile, "utf8")).toBe(planMarkdown);

    expect(await runDeck(["issue", "approve-plan", publicId, "--json"], isolated)).toBe(0);

    const implementNext = spawnDeckJson(
      ["issue", "next", "--mode", "implement", "--project", "E2E"],
      env,
    );
    expect(implementNext.exitCode).toBe(0);
    if (!implementNext.response.ok) {
      throw new Error(implementNext.response.error.message);
    }
    const implementIssue = implementNext.response.data.issue as {
      publicId: string;
    } | null;
    expect(implementIssue?.publicId).toBe(publicId);

    expect(
      await runDeck(
        [
          "issue",
          "move",
          publicId,
          "--status",
          "in-progress",
          "--validation",
          "Implemented banner",
          "--json",
        ],
        isolated,
      ),
    ).toBe(0);

    expect(
      await runDeck(["issue", "move", publicId, "--status", "needs-review", "--json"], isolated),
    ).toBe(0);

    const reviewNext = spawnDeckJson(
      ["issue", "next", "--mode", "review", "--project", "E2E"],
      env,
    );
    expect(reviewNext.exitCode).toBe(0);
    if (!reviewNext.response.ok) {
      throw new Error(reviewNext.response.error.message);
    }
    const reviewIssue = reviewNext.response.data.issue as {
      publicId: string;
    } | null;
    expect(reviewIssue?.publicId).toBe(publicId);

    expect(
      await runDeck(
        [
          "issue",
          "move",
          publicId,
          "--status",
          "changes-requested",
          "--validation",
          "Adjust spacing",
          "--json",
        ],
        isolated,
      ),
    ).toBe(0);

    const addressNext = spawnDeckJson(
      ["issue", "next", "--mode", "address-review", "--project", "E2E"],
      env,
    );
    expect(addressNext.exitCode).toBe(0);
    if (!addressNext.response.ok) {
      throw new Error(addressNext.response.error.message);
    }
    const addressIssue = addressNext.response.data.issue as {
      publicId: string;
    } | null;
    expect(addressIssue?.publicId).toBe(publicId);

    expect(
      await runDeck(["issue", "move", publicId, "--status", "needs-review", "--json"], isolated),
    ).toBe(0);

    expect(
      await runDeck(["issue", "move", publicId, "--status", "accepted", "--json"], isolated),
    ).toBe(0);

    expect(await runDeck(["issue", "move", publicId, "--status", "done", "--json"], isolated)).toBe(
      0,
    );

    const dbFinal = openDatabase(home);
    try {
      const done = findIssueByPublicId(dbFinal, publicId);
      expect(done?.workflowStatus).toBe("done");
      expect(done?.planStatus).toBe("approved");
      expect(done?.validationSummary).toBe("Adjust spacing");
    } finally {
      closeDatabase(dbFinal);
    }

    const showProc = spawnDeckJson(["issue", "show", publicId], env);
    expect(showProc.exitCode).toBe(0);
    if (!showProc.response.ok) {
      throw new Error(showProc.response.error.message);
    }
    const showData = showProc.response.data as {
      parsed: { whatToBuild: string | null };
    };
    expect(showData.parsed.whatToBuild).toContain("greeting banner");

    const implementAfterDone = spawnDeckJson(
      ["issue", "next", "--mode", "implement", "--project", "E2E"],
      env,
    );
    expect(implementAfterDone.exitCode).toBe(0);
    if (!implementAfterDone.response.ok) {
      throw new Error(implementAfterDone.response.error.message);
    }
    expect(implementAfterDone.response.data.issue).toBeNull();

    const listProc = spawnDeckJson(
      ["issue", "list", "--project", "E2E", "--status", "done", "--json"],
      env,
    );
    expect(listProc.exitCode).toBe(0);
    if (!listProc.response.ok) {
      throw new Error(listProc.response.error.message);
    }
    const listData = listProc.response.data as {
      count: number;
      issues: Array<{ publicId: string }>;
    };
    expect(listData.count).toBe(1);
    expect(listData.issues[0]?.publicId).toBe(publicId);

    expect(
      await runDeck(
        ["issue", "comment", publicId, "--body", "E2E workflow completed.", "--json"],
        isolated,
      ),
    ).toBe(0);
  });

  test("simple issue is selectable for implement without a plan", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;

    await runDeck(["project", "add", "--key", "SIM", "--name", "Simple", "--json"], isolated);
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "SIM",
        "--title",
        "Quick fix",
        "--body",
        ISSUE_PATH,
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "simple",
        "--json",
      ],
      isolated,
    );

    const next = spawnDeckJson(["issue", "next", "--mode", "implement", "--project", "SIM"], env);
    expect(next.exitCode).toBe(0);
    if (!next.response.ok) {
      throw new Error(next.response.error.message);
    }
    const issue = next.response.data.issue as { publicId: string } | null;
    expect(issue?.publicId).toBe("SIM-1");

    const promptLines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      promptLines.push(args.map(String).join(" "));
    };
    try {
      const code = await runDeck(
        ["issue", "prompt", "SIM-1", "--mode", "implement", "--json"],
        isolated,
      );
      expect(code).toBe(0);
      const parsed = parseDeckJson<{ prompt?: string }>(promptLines.join("\n"));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.data.prompt).toContain("SIM-1");
      }
    } finally {
      console.log = originalLog;
    }
  });
});
