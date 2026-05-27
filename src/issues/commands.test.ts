import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { closeDatabase, openDatabase } from "../db/client.ts";
import {
  createIssue,
  findIssueByPublicId,
  isIssueUnblocked,
  listBlockerIssues,
  listIssues,
} from "../index.ts";
import { addProjectPath, createProject } from "../projects/repository.ts";
import { runDeck, setupInitializedHome, spawnDeckJson } from "../testing/helpers.ts";

describe("issue commands", () => {
  test("creates issues with per-project public IDs", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    expect(
      await runDeck(["project", "add", "--key", "OLA", "--name", "Ola", "--json"], isolated),
    ).toBe(0);

    expect(
      await runDeck(
        [
          "issue",
          "create",
          "--project",
          "OLA",
          "--title",
          "First",
          "--body",
          "## What to build\n\nOne",
          "--json",
        ],
        isolated,
      ),
    ).toBe(0);

    expect(
      await runDeck(
        [
          "issue",
          "create",
          "--project",
          "OLA",
          "--title",
          "Second",
          "--body",
          "## What to build\n\nTwo",
          "--json",
        ],
        isolated,
      ),
    ).toBe(0);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issues = listIssues(db, { projectKey: "OLA" });
      expect(issues.map((i) => i.publicId)).toEqual(["OLA-1", "OLA-2"]);
      expect(issues[0]?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    } finally {
      closeDatabase(db);
    }
  });

  test("infers project from cwd for issue create", async () => {
    const isolated = await setupInitializedHome();
    const { env, home } = isolated;
    const repoRoot = join(home, "repos", "ola");
    await mkdir(repoRoot, { recursive: true });
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const project = createProject(db, { key: "OLA", name: "Ola" });
      addProjectPath(db, { projectKey: project.key, path: repoRoot });
    } finally {
      closeDatabase(db);
    }

    const previousCwd = process.cwd();
    process.chdir(repoRoot);
    try {
      expect(
        await runDeck(
          [
            "issue",
            "create",
            "--title",
            "Inferred",
            "--body",
            "## What to build\n\nFrom cwd",
            "--json",
          ],
          isolated,
        ),
      ).toBe(0);
    } finally {
      process.chdir(previousCwd);
    }

    const db2 = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issue = findIssueByPublicId(db2, "OLA-1");
      expect(issue?.title).toBe("Inferred");
    } finally {
      closeDatabase(db2);
    }
  });

  test("reads body from file path", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    await runDeck(["project", "add", "--key", "DOC", "--name", "Docs", "--json"], isolated);

    const bodyDir = await mkdtemp(join(tmpdir(), "flightdeck-body-"));
    const bodyPath = join(bodyDir, "issue.md");
    await writeFile(
      bodyPath,
      "## What to build\n\nFrom file\n\n## Blocked by\n\nNone - can start immediately\n",
    );

    expect(
      await runDeck(
        [
          "issue",
          "create",
          "--project",
          "DOC",
          "--title",
          "File body",
          "--body",
          bodyPath,
          "--json",
        ],
        isolated,
      ),
    ).toBe(0);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issue = findIssueByPublicId(db, "DOC-1");
      expect(issue?.bodyMarkdown).toContain("From file");
    } finally {
      closeDatabase(db);
    }
  });

  test("lists issues with workflow and triage filters", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "FIL", name: "Filter" });
      createIssue(db, {
        projectKey: "FIL",
        title: "Backlog ready",
        body: "## What to build\n\nA",
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
      });
      createIssue(db, {
        projectKey: "FIL",
        title: "In progress",
        body: "## What to build\n\nB",
        triageRole: "ready-for-agent",
        workflowStatus: "in-progress",
      });
    } finally {
      closeDatabase(db);
    }

    const { exitCode, response } = spawnDeckJson<{
      count: number;
      issues: Array<{ title: string }>;
    }>(
      [
        "issue",
        "list",
        "--project",
        "FIL",
        "--status",
        "backlog",
        "--triage-role",
        "ready-for-agent",
      ],
      env,
    );
    expect(exitCode).toBe(0);
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data.count).toBe(1);
      expect(response.data.issues[0]?.title).toBe("Backlog ready");
    }
  });

  test("shows issue with structured parsed fields", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "SHW", name: "Show" });
      createIssue(db, {
        projectKey: "SHW",
        title: "Show me",
        body: `## Parent

SHW-0

## What to build

Build feature

## Acceptance criteria

- [ ] Works

## Blocked by

None - can start immediately`,
      });
    } finally {
      closeDatabase(db);
    }

    const { exitCode, response } = spawnDeckJson<{
      publicId: string;
      parsed: { whatToBuild: string | null; acceptanceCriteria: string[] };
      bodyMarkdown: string;
    }>(["issue", "show", "SHW-1"], env);
    expect(exitCode).toBe(0);
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data.publicId).toBe("SHW-1");
      expect(response.data.parsed.whatToBuild).toBe("Build feature");
      expect(response.data.parsed.acceptanceCriteria).toEqual(["Works"]);
      expect(response.data.bodyMarkdown).toContain("## What to build");
    }
  });

  test("does not create dependencies from Parent, What to build, or acceptance criteria", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "SEC", name: "Sections" });
      createIssue(db, {
        projectKey: "SEC",
        title: "Referenced blocker",
        body: "## What to build\n\nBlocker work",
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
      });
      const dependent = createIssue(db, {
        projectKey: "SEC",
        title: "Dependent",
        body: `## Parent

SEC-1

## What to build

Depends on SEC-1 in prose

## Acceptance criteria

- [ ] SEC-1 is mentioned

## Blocked by

None - can start immediately`,
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
      });

      expect(listBlockerIssues(db, dependent.id)).toEqual([]);
    } finally {
      closeDatabase(db);
    }
  });

  test("creates dependency only from Blocked by section in markdown", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "BLK", name: "Blocked" });
      createIssue(db, {
        projectKey: "BLK",
        title: "Blocker",
        body: "## What to build\n\nBlocker",
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
      });
      const dependent = createIssue(db, {
        projectKey: "BLK",
        title: "Blocked child",
        body: `## What to build

Child work

## Blocked by

BLK-1`,
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
      });

      const blockers = listBlockerIssues(db, dependent.id);
      expect(blockers.map((b) => b.publicId)).toEqual(["BLK-1"]);
      expect(isIssueUnblocked(db, dependent)).toBe(false);
    } finally {
      closeDatabase(db);
    }
  });

  test("explicit --manual-blocker overrides markdown Blocked by text", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "OVR", name: "Override" });
      const issue = createIssue(db, {
        projectKey: "OVR",
        title: "Override blocker",
        body: `## What to build

Work

## Blocked by

Waiting on access`,
        manualBlocker: "",
      });

      expect(issue.manualBlocker).toBe("");
      expect(isIssueUnblocked(db, issue)).toBe(true);
    } finally {
      closeDatabase(db);
    }
  });

  test("update sets and clears manual blocker", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "UPD", name: "Update" });
      createIssue(db, {
        projectKey: "UPD",
        title: "Blocked issue",
        body: "## What to build\n\nWork",
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
        complexity: "simple",
      });
    } finally {
      closeDatabase(db);
    }

    const { exitCode: setCode, response: setResponse } = spawnDeckJson<{
      manualBlocker: string;
      unblocked: boolean;
    }>(["issue", "update", "UPD-1", "--manual-blocker", "Waiting on access"], env);
    expect(setCode).toBe(0);
    expect(setResponse.ok).toBe(true);
    if (setResponse.ok) {
      expect(setResponse.data.manualBlocker).toBe("Waiting on access");
      expect(setResponse.data.unblocked).toBe(false);
    }

    const { exitCode: clearCode, response: clearResponse } = spawnDeckJson<{
      manualBlocker: string;
      unblocked: boolean;
    }>(["issue", "update", "UPD-1", "--clear-manual-blocker"], env);
    expect(clearCode).toBe(0);
    expect(clearResponse.ok).toBe(true);
    if (clearResponse.ok) {
      expect(clearResponse.data.manualBlocker).toBe("");
      expect(clearResponse.data.unblocked).toBe(true);
    }
  });

  test("clearing manual blocker makes issue eligible for implement queue", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "QUE", name: "Queue" });
      createIssue(db, {
        projectKey: "QUE",
        title: "Was blocked",
        body: "## What to build\n\nWork",
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
        complexity: "simple",
        manualBlocker: "External wait",
      });
    } finally {
      closeDatabase(db);
    }

    const blocked = spawnDeckJson<{ issue: { publicId: string } | null }>(
      ["issue", "next", "--mode", "implement", "--project", "QUE"],
      env,
    );
    expect(blocked.response.ok).toBe(true);
    if (blocked.response.ok) {
      expect(blocked.response.data.issue).toBeNull();
    }

    expect(
      await runDeck(["issue", "update", "QUE-1", "--clear-manual-blocker", "--json"], isolated),
    ).toBe(0);

    const unblocked = spawnDeckJson<{ issue: { publicId: string } | null }>(
      ["issue", "next", "--mode", "implement", "--project", "QUE"],
      env,
    );
    expect(unblocked.response.ok).toBe(true);
    if (unblocked.response.ok) {
      expect(unblocked.response.data.issue?.publicId).toBe("QUE-1");
    }
  });

  test("update triage role makes backlog issue eligible for implement", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "TRI", name: "Triage" });
      createIssue(db, {
        projectKey: "TRI",
        title: "Needs triage",
        body: "## What to build\n\nWork",
        triageRole: "needs-triage",
        workflowStatus: "backlog",
        complexity: "simple",
      });
    } finally {
      closeDatabase(db);
    }

    expect(
      await runDeck(
        ["issue", "update", "TRI-1", "--triage-role", "ready-for-agent", "--json"],
        isolated,
      ),
    ).toBe(0);

    const { response } = spawnDeckJson<{ issue: { publicId: string } | null }>(
      ["issue", "next", "--mode", "implement", "--project", "TRI"],
      env,
    );
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data.issue?.publicId).toBe("TRI-1");
    }
  });

  test("update body from file changes parsed fields", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "BOD", name: "Body" });
      createIssue(db, {
        projectKey: "BOD",
        title: "Mutable",
        body: "## What to build\n\nOriginal",
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
      });
    } finally {
      closeDatabase(db);
    }

    const bodyDir = await mkdtemp(join(tmpdir(), "flightdeck-update-body-"));
    const bodyPath = join(bodyDir, "updated.md");
    await writeFile(
      bodyPath,
      `## What to build

Updated from file

## Acceptance criteria

- [ ] New criterion

## Blocked by

None - can start immediately`,
    );

    const { exitCode, response } = spawnDeckJson<{
      parsed: { whatToBuild: string | null; acceptanceCriteria: string[] };
    }>(["issue", "update", "BOD-1", "--body", bodyPath], env);
    expect(exitCode).toBe(0);
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data.parsed.whatToBuild).toBe("Updated from file");
      expect(response.data.parsed.acceptanceCriteria).toEqual(["New criterion"]);
    }
  });

  test("update body adds markdown dependencies but does not remove them", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    await runDeck(["project", "add", "--key", "UPD", "--name", "Update deps", "--json"], isolated);
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "UPD",
        "--title",
        "Blocker",
        "--body",
        "## What to build\n\nBlocker work\n\n## Blocked by\n\nNone - can start immediately",
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
        "create",
        "--project",
        "UPD",
        "--title",
        "Dependent",
        "--body",
        "## What to build\n\nDependent work\n\n## Blocked by\n\nNone - can start immediately",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "needs-plan",
        "--json",
      ],
      isolated,
    );

    const blockedBody = `## What to build

Dependent work

## Blocked by

UPD-1`;

    const { response: withBlocker } = spawnDeckJson<{
      dependencyBlockers: Array<{ publicId: string }>;
    }>(["issue", "update", "UPD-2", "--body", blockedBody, "--json"], env);
    expect(withBlocker.ok).toBe(true);
    if (withBlocker.ok) {
      expect(withBlocker.data.dependencyBlockers.map((b) => b.publicId)).toEqual(["UPD-1"]);
    }

    const blockedPlan = spawnDeckJson<{ issue: { publicId: string } | null }>(
      ["issue", "next", "--mode", "plan", "--project", "UPD"],
      env,
    );
    expect(blockedPlan.response.ok).toBe(true);
    if (blockedPlan.response.ok) {
      expect(blockedPlan.response.data.issue?.publicId).not.toBe("UPD-2");
    }

    const blockedImplement = spawnDeckJson<{ issue: { publicId: string } | null }>(
      ["issue", "next", "--mode", "implement", "--project", "UPD"],
      env,
    );
    expect(blockedImplement.response.ok).toBe(true);
    if (blockedImplement.response.ok) {
      expect(blockedImplement.response.data.issue?.publicId).not.toBe("UPD-2");
    }

    const clearedBody = `## What to build

Dependent work

## Blocked by

None - can start immediately`;

    const { response: afterClear } = spawnDeckJson<{
      dependencyBlockers: Array<{ publicId: string }>;
    }>(["issue", "update", "UPD-2", "--body", clearedBody, "--json"], env);
    expect(afterClear.ok).toBe(true);
    if (afterClear.ok) {
      expect(afterClear.data.dependencyBlockers.map((b) => b.publicId)).toEqual(["UPD-1"]);
    }

    expect(
      await runDeck(["issue", "unblock-by", "UPD-2", "--issue", "UPD-1", "--json"], isolated),
    ).toBe(0);

    const { response: unblocked } = spawnDeckJson<{
      dependencyBlockers: Array<{ publicId: string }>;
    }>(["issue", "show", "UPD-2", "--json"], env);
    expect(unblocked.ok).toBe(true);
    if (unblocked.ok) {
      expect(unblocked.data.dependencyBlockers).toEqual([]);
    }

    const readyPlan = spawnDeckJson<{ issue: { publicId: string } | null }>(
      ["issue", "next", "--mode", "plan", "--project", "UPD"],
      env,
    );
    expect(readyPlan.response.ok).toBe(true);
    if (readyPlan.response.ok) {
      expect(readyPlan.response.data.issue?.publicId).toBe("UPD-2");
    }
  });

  test("block-by and unblock-by manage dependency blockers", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    await runDeck(["project", "add", "--key", "BLK2", "--name", "Block", "--json"], isolated);
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "BLK2",
        "--title",
        "Blocker",
        "--body",
        "## What to build\n\nBlocker",
        "--triage-role",
        "needs-triage",
        "--json",
      ],
      isolated,
    );
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "BLK2",
        "--title",
        "Dependent",
        "--body",
        "## What to build\n\nDependent",
        "--triage-role",
        "ready-for-agent",
        "--complexity",
        "simple",
        "--json",
      ],
      isolated,
    );

    expect(
      await runDeck(["issue", "block-by", "BLK2-2", "--issue", "BLK2-1", "--json"], isolated),
    ).toBe(0);

    const blocked = spawnDeckJson<{ issue: { publicId: string } | null }>(
      ["issue", "next", "--mode", "implement", "--project", "BLK2"],
      env,
    );
    expect(blocked.response.ok).toBe(true);
    if (blocked.response.ok) {
      expect(blocked.response.data.issue?.publicId).not.toBe("BLK2-2");
    }

    expect(
      await runDeck(["issue", "unblock-by", "BLK2-2", "--issue", "BLK2-1", "--json"], isolated),
    ).toBe(0);

    const unblocked = spawnDeckJson<{ issue: { publicId: string } | null }>(
      ["issue", "next", "--mode", "implement", "--project", "BLK2"],
      env,
    );
    expect(unblocked.response.ok).toBe(true);
    if (unblocked.response.ok) {
      expect(unblocked.response.data.issue?.publicId).toBe("BLK2-2");
    }

    await runDeck(["issue", "block-by", "BLK2-2", "--issue", "BLK2-1", "--json"], isolated);
    await runDeck(["issue", "move", "BLK2-1", "--status", "done", "--json"], isolated);

    const unblockedByDone = spawnDeckJson<{ issue: { publicId: string } | null }>(
      ["issue", "next", "--mode", "implement", "--project", "BLK2"],
      env,
    );
    expect(unblockedByDone.response.ok).toBe(true);
    if (unblockedByDone.response.ok) {
      expect(unblockedByDone.response.data.issue?.publicId).toBe("BLK2-2");
    }
  });

  test("records dependency via --blocked-by", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    await runDeck(["project", "add", "--key", "DEP", "--name", "Dep", "--json"], isolated);
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "DEP",
        "--title",
        "Blocker",
        "--body",
        "## What to build\n\nBlocker",
        "--json",
      ],
      isolated,
    );
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "DEP",
        "--title",
        "Blocked",
        "--body",
        "## What to build\n\nBlocked",
        "--blocked-by",
        "DEP-1",
        "--json",
      ],
      isolated,
    );

    const { response } = spawnDeckJson<{
      dependencyBlockers: Array<{ publicId: string }>;
    }>(["issue", "show", "DEP-2"], env);
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data.dependencyBlockers[0]?.publicId).toBe("DEP-1");
    }
  });
});
