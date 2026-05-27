import { describe, expect, test } from "bun:test";

import { closeDatabase, openDatabase } from "../db/client.ts";
import { createIssue, isIssueUnblocked, selectNextIssue, updateIssue } from "../index.ts";
import { createProject } from "../projects/repository.ts";
import { setupInitializedHome } from "../testing/helpers.ts";

async function setupDb() {
  const isolated = await setupInitializedHome();
  const db = openDatabase(isolated.env.FLIGHTDECK_HOME!);
  createProject(db, { key: "Q", name: "Queue" });
  return { db, isolated };
}

function readyAgent(
  db: ReturnType<typeof openDatabase>,
  title: string,
  extra: Partial<Parameters<typeof createIssue>[1]> = {},
) {
  return createIssue(db, {
    projectKey: "Q",
    title,
    body: "## What to build\n\nWork",
    triageRole: "ready-for-agent",
    ...extra,
  });
}

describe("unblocked rule", () => {
  test("blocks manual blocker text", async () => {
    const { db } = await setupDb();
    try {
      const issue = readyAgent(db, "Manual", {
        workflowStatus: "backlog",
        manualBlocker: "Waiting on access",
      });
      expect(isIssueUnblocked(db, issue)).toBe(false);
    } finally {
      closeDatabase(db);
    }
  });

  test("blocks manual blocker text from markdown Blocked by section", async () => {
    const { db } = await setupDb();
    try {
      const issue = createIssue(db, {
        projectKey: "Q",
        title: "Markdown blocker",
        body: `## What to build

Work

## Blocked by

Waiting on access`,
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
        complexity: "simple",
      });
      expect(issue.manualBlocker).toBe("Waiting on access");
      expect(isIssueUnblocked(db, issue)).toBe(false);
    } finally {
      closeDatabase(db);
    }
  });

  test("blocks needs-info and wontfix triage roles", async () => {
    const { db } = await setupDb();
    try {
      const needsInfo = createIssue(db, {
        projectKey: "Q",
        title: "Info",
        body: "## What to build\n\nx",
        triageRole: "needs-info",
        workflowStatus: "backlog",
      });
      const wontfix = createIssue(db, {
        projectKey: "Q",
        title: "No",
        body: "## What to build\n\nx",
        triageRole: "wontfix",
        workflowStatus: "backlog",
      });
      expect(isIssueUnblocked(db, needsInfo)).toBe(false);
      expect(isIssueUnblocked(db, wontfix)).toBe(false);
    } finally {
      closeDatabase(db);
    }
  });

  test("accepted blockers do not unblock; done blockers do", async () => {
    const { db } = await setupDb();
    try {
      const blocker = readyAgent(db, "Blocker", { workflowStatus: "backlog" });
      const dependent = createIssue(db, {
        projectKey: "Q",
        title: "Dependent",
        body: "## What to build\n\ny",
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
        blockedByPublicIds: [blocker.publicId],
      });

      expect(isIssueUnblocked(db, dependent)).toBe(false);

      updateIssue(db, blocker.publicId, { workflowStatus: "accepted" });
      expect(isIssueUnblocked(db, dependent)).toBe(false);

      updateIssue(db, blocker.publicId, { workflowStatus: "done" });
      expect(isIssueUnblocked(db, dependent)).toBe(true);
    } finally {
      closeDatabase(db);
    }
  });
});

describe("next queues", () => {
  test("plan queue selects needs-plan backlog issues with eligible plan status", async () => {
    const { db } = await setupDb();
    try {
      readyAgent(db, "Simple", {
        workflowStatus: "backlog",
        complexity: "simple",
      });
      const target = readyAgent(db, "Plan me", {
        workflowStatus: "backlog",
        complexity: "needs-plan",
        planStatus: "none",
      });
      readyAgent(db, "Approved already", {
        workflowStatus: "backlog",
        complexity: "needs-plan",
        planStatus: "approved",
      });

      const next = selectNextIssue(db, "plan");
      expect(next?.publicId).toBe(target.publicId);
    } finally {
      closeDatabase(db);
    }
  });

  test("implement queue requires approved plan for complex issues", async () => {
    const { db } = await setupDb();
    try {
      const simple = readyAgent(db, "Simple work", {
        workflowStatus: "backlog",
        complexity: "simple",
      });
      readyAgent(db, "Needs plan approval", {
        workflowStatus: "backlog",
        complexity: "needs-plan",
        planStatus: "none",
      });
      const approved = readyAgent(db, "Approved complex", {
        workflowStatus: "backlog",
        complexity: "needs-plan",
        planStatus: "approved",
      });

      const first = selectNextIssue(db, "implement");
      expect(first?.publicId).toBe(simple.publicId);

      updateIssue(db, simple.publicId, { workflowStatus: "done" });
      const second = selectNextIssue(db, "implement");
      expect(second?.publicId).toBe(approved.publicId);
    } finally {
      closeDatabase(db);
    }
  });

  test("review queue selects needs-review regardless of triage", async () => {
    const { db } = await setupDb();
    try {
      createIssue(db, {
        projectKey: "Q",
        title: "Backlog",
        body: "## What to build\n\nx",
        triageRole: "needs-triage",
        workflowStatus: "backlog",
      });
      const review = createIssue(db, {
        projectKey: "Q",
        title: "Review me",
        body: "## What to build\n\nx",
        triageRole: "ready-for-human",
        workflowStatus: "needs-review",
      });

      const next = selectNextIssue(db, "review");
      expect(next?.publicId).toBe(review.publicId);
    } finally {
      closeDatabase(db);
    }
  });

  test("changes-requested issues appear in address-review but not implement", async () => {
    const { db } = await setupDb();
    try {
      const cr = readyAgent(db, "Changes requested", {
        workflowStatus: "changes-requested",
        complexity: "simple",
      });

      expect(selectNextIssue(db, "address-review")?.publicId).toBe(cr.publicId);
      expect(selectNextIssue(db, "implement")).toBeNull();
    } finally {
      closeDatabase(db);
    }
  });

  test("markdown manual blocker excludes issue from plan and implement queues", async () => {
    const { db } = await setupDb();
    try {
      createIssue(db, {
        projectKey: "Q",
        title: "Blocked in body",
        body: `## What to build

Work

## Blocked by

Waiting on access`,
        triageRole: "ready-for-agent",
        workflowStatus: "backlog",
        complexity: "simple",
      });

      expect(selectNextIssue(db, "plan")).toBeNull();
      expect(selectNextIssue(db, "implement")).toBeNull();
    } finally {
      closeDatabase(db);
    }
  });

  test("address-review queue requires unblocked changes-requested", async () => {
    const { db } = await setupDb();
    try {
      const blocked = readyAgent(db, "Blocked CR", {
        workflowStatus: "changes-requested",
        manualBlocker: "Still waiting",
      });
      const target = readyAgent(db, "Ready CR", {
        workflowStatus: "changes-requested",
      });

      const next = selectNextIssue(db, "address-review");
      expect(next?.publicId).toBe(target.publicId);
      expect(next?.publicId).not.toBe(blocked.publicId);
    } finally {
      closeDatabase(db);
    }
  });

  test("returns null when no eligible issue exists", async () => {
    const { db } = await setupDb();
    try {
      expect(selectNextIssue(db, "plan")).toBeNull();
      expect(selectNextIssue(db, "implement")).toBeNull();
      expect(selectNextIssue(db, "review")).toBeNull();
      expect(selectNextIssue(db, "address-review")).toBeNull();
    } finally {
      closeDatabase(db);
    }
  });

  test("blocked dependencies exclude issues from implement queue", async () => {
    const { db } = await setupDb();
    try {
      const blocker = createIssue(db, {
        projectKey: "Q",
        title: "Blocker",
        body: "## What to build\n\nWork",
        triageRole: "needs-triage",
        workflowStatus: "in-progress",
      });
      readyAgent(db, "Blocked child", {
        workflowStatus: "backlog",
        complexity: "simple",
        blockedByPublicIds: [blocker.publicId],
      });

      expect(selectNextIssue(db, "implement")).toBeNull();
    } finally {
      closeDatabase(db);
    }
  });

  test("plan queue includes changes-requested plan status", async () => {
    const { db } = await setupDb();
    try {
      const target = readyAgent(db, "Replan", {
        workflowStatus: "backlog",
        complexity: "needs-plan",
        planStatus: "changes-requested",
      });

      const next = selectNextIssue(db, "plan");
      expect(next?.publicId).toBe(target.publicId);
    } finally {
      closeDatabase(db);
    }
  });
});
