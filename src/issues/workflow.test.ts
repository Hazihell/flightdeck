import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  closeDatabase,
  openDatabase,
} from "../db/client.ts";
import { findIssueByPublicId, listIssueComments } from "../index.ts";
import { runDeck, setupInitializedHome } from "../testing/helpers.ts";

describe("workflow commands", () => {
  test("moves issue status and stores validation and git metadata", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    await runDeck(
      ["project", "add", "--key", "WF", "--name", "Workflow", "--json"],
      isolated,
    );
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "WF",
        "--title",
        "Move me",
        "--body",
        "## What to build\n\nWork",
        "--json",
      ],
      isolated,
    );

    expect(
      await runDeck(
        [
          "issue",
          "move",
          "WF-1",
          "--status",
          "in-progress",
          "--validation",
          "Started work",
          "--branch",
          "feat/wf-1",
          "--worktree-path",
          "/tmp/wf-worktree",
          "--commit",
          "abc123",
          "--pr-url",
          "https://example.com/pr/1",
          "--json",
        ],
        isolated,
      ),
    ).toBe(0);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issue = findIssueByPublicId(db, "WF-1");
      expect(issue?.workflowStatus).toBe("in-progress");
      expect(issue?.validationSummary).toBe("Started work");
      expect(issue?.branch).toBe("feat/wf-1");
      expect(issue?.worktreePath).toBe("/tmp/wf-worktree");
      expect(issue?.commitRef).toBe("abc123");
      expect(issue?.prUrl).toBe("https://example.com/pr/1");
    } finally {
      closeDatabase(db);
    }
  });

  test("rejects unknown workflow status", async () => {
    const isolated = await setupInitializedHome();
    await runDeck(
      ["project", "add", "--key", "BAD", "--name", "Bad", "--json"],
      isolated,
    );
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "BAD",
        "--title",
        "Issue",
        "--body",
        "## What to build\n\nx",
        "--json",
      ],
      isolated,
    );

    expect(
      await runDeck(
        ["issue", "move", "BAD-1", "--status", "invalid-status", "--json"],
        isolated,
      ),
    ).toBe(1);
  });

  test("perserves markdown comment bodies", async () => {
    const isolated = await setupInitializedHome();
    const { env, home } = isolated;
    await runDeck(
      ["project", "add", "--key", "CM", "--name", "Comments", "--json"],
      isolated,
    );
    await runDeck(
      [
        "issue",
        "create",
        "--project",
        "CM",
        "--title",
        "Discuss",
        "--body",
        "## What to build\n\nx",
        "--json",
      ],
      isolated,
    );

    const commentBody = "## Review\n\n- [ ] Fix **edge** case\n\n```ts\nconst x = 1;\n```";
    expect(
      await runDeck(
        ["issue", "comment", "CM-1", "--body", commentBody, "--json"],
        isolated,
      ),
    ).toBe(0);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issue = findIssueByPublicId(db, "CM-1");
      const comments = listIssueComments(db, issue!.id);
      expect(comments).toHaveLength(1);
      expect(comments[0]?.bodyMarkdown).toBe(commentBody);
    } finally {
      closeDatabase(db);
    }

    const bodyPath = join(home, "comment.md");
    await Bun.write(bodyPath, "From **file** path");
    expect(
      await runDeck(
        ["issue", "comment", "CM-1", "--body", bodyPath, "--json"],
        isolated,
      ),
    ).toBe(0);

    const db2 = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issue = findIssueByPublicId(db2, "CM-1");
      const comments = listIssueComments(db2, issue!.id);
      expect(comments).toHaveLength(2);
      expect(comments[1]?.bodyMarkdown).toBe("From **file** path");
    } finally {
      closeDatabase(db2);
    }
  });
});
