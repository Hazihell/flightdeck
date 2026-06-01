import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { closeDatabase, openDatabase } from "../db/client.ts";
import { createProject } from "../projects/repository.ts";
import { setupInitializedHome, spawnDeckJson } from "../testing/helpers.ts";
import { findPrdByPublicId } from "./repository.ts";

describe("prd commands", () => {
  test("creates and shows a PRD from inline markdown", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "PRJ", name: "Project" });
    } finally {
      closeDatabase(db);
    }

    const created = spawnDeckJson<{
      publicId: string;
      status: string;
      bodyMarkdown: string;
      userStories: Array<{ number: number; text: string }>;
    }>(
      [
        "prd",
        "create",
        "--project",
        "PRJ",
        "--title",
        "Checkout PRD",
        "--body",
        "# Checkout\n\nShip it",
      ],
      env,
    );

    expect(created.exitCode).toBe(0);
    expect(created.response.ok).toBe(true);
    if (created.response.ok) {
      expect(created.response.data.publicId).toBe("PRJ-PRD-1");
      expect(created.response.data.status).toBe("active");
      expect(created.response.data.bodyMarkdown).toBe("# Checkout\n\nShip it");
      expect(created.response.data.userStories).toEqual([]);
    }

    const shown = spawnDeckJson<{ publicId: string; bodyMarkdown: string }>(
      ["prd", "show", "prj-prd-1"],
      env,
    );
    expect(shown.exitCode).toBe(0);
    expect(shown.response.ok).toBe(true);
    if (shown.response.ok) {
      expect(shown.response.data.publicId).toBe("PRJ-PRD-1");
      expect(shown.response.data.bodyMarkdown).toContain("Ship it");
    }
  });

  test("creates a PRD from file markdown and preserves body", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const bodyDir = await mkdtemp(join(tmpdir(), "flightdeck-prd-cli-"));
    const bodyPath = join(bodyDir, "prd.md");
    const body = "# File PRD\n\nExact body\n";
    await writeFile(bodyPath, body);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "DOC", name: "Docs" });
    } finally {
      closeDatabase(db);
    }

    const created = spawnDeckJson<{ publicId: string }>(
      ["prd", "create", "--project", "DOC", "--title", "File PRD", "--body", bodyPath],
      env,
    );
    expect(created.exitCode).toBe(0);
    expect(created.response.ok).toBe(true);

    const db2 = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      expect(findPrdByPublicId(db2, "DOC-PRD-1")?.bodyMarkdown).toBe(body);
    } finally {
      closeDatabase(db2);
    }
  });

  test("rejects missing inputs and invalid status", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "BAD", name: "Bad" });
    } finally {
      closeDatabase(db);
    }

    const missingTitle = spawnDeckJson(
      ["prd", "create", "--project", "BAD", "--body", "# Body"],
      env,
    );
    expect(missingTitle.exitCode).toBe(1);
    expect(missingTitle.response.ok).toBe(false);

    const missingBody = spawnDeckJson(
      ["prd", "create", "--project", "BAD", "--title", "No body"],
      env,
    );
    expect(missingBody.exitCode).toBe(1);
    expect(missingBody.response.ok).toBe(false);

    const invalidStatus = spawnDeckJson(
      [
        "prd",
        "create",
        "--project",
        "BAD",
        "--title",
        "Wrong status",
        "--body",
        "# Body",
        "--status",
        "done",
      ],
      env,
    );
    expect(invalidStatus.exitCode).toBe(1);
    expect(invalidStatus.response.ok).toBe(false);
  });

  test("creating PRDs does not create issues or issue documents", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "SEP", name: "Separate" });
    } finally {
      closeDatabase(db);
    }

    const created = spawnDeckJson(
      ["prd", "create", "--project", "SEP", "--title", "Only PRD", "--body", "# PRD"],
      env,
    );
    expect(created.exitCode).toBe(0);

    const db2 = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const issueCount = db2
        .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM issues")
        .get();
      const docCount = db2
        .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM documents")
        .get();
      expect(issueCount?.count).toBe(0);
      expect(docCount?.count).toBe(0);
    } finally {
      closeDatabase(db2);
    }
  });

  test("lists draft and active PRDs by default and filters archived explicitly", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "LST", name: "List" });
    } finally {
      closeDatabase(db);
    }

    spawnDeckJson(
      [
        "prd",
        "create",
        "--project",
        "LST",
        "--title",
        "Draft",
        "--body",
        "# Draft",
        "--status",
        "draft",
      ],
      env,
    );
    spawnDeckJson(
      ["prd", "create", "--project", "LST", "--title", "Active", "--body", "# Active"],
      env,
    );
    spawnDeckJson(
      [
        "prd",
        "create",
        "--project",
        "LST",
        "--title",
        "Archived",
        "--body",
        "# Archived",
        "--status",
        "archived",
      ],
      env,
    );

    const defaultList = spawnDeckJson<{
      count: number;
      prds: Array<{ publicId: string; status: string }>;
    }>(["prd", "list", "--project", "LST"], env);
    expect(defaultList.exitCode).toBe(0);
    expect(defaultList.response.ok).toBe(true);
    if (defaultList.response.ok) {
      expect(defaultList.response.data.count).toBe(2);
      expect(defaultList.response.data.prds.map((prd) => prd.status)).toEqual(["draft", "active"]);
    }

    const archivedList = spawnDeckJson<{
      count: number;
      prds: Array<{ publicId: string; status: string }>;
    }>(["prd", "list", "--project", "LST", "--status", "archived"], env);
    expect(archivedList.exitCode).toBe(0);
    expect(archivedList.response.ok).toBe(true);
    if (archivedList.response.ok) {
      expect(archivedList.response.data.count).toBe(1);
      expect(archivedList.response.data.prds[0]?.status).toBe("archived");
    }
  });

  test("list requires an explicit or inferred project", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "APP", name: "App" });
      createProject(db, { key: "WEB", name: "Web" });
    } finally {
      closeDatabase(db);
    }

    spawnDeckJson(
      ["prd", "create", "--project", "APP", "--title", "App PRD", "--body", "# App"],
      env,
    );
    spawnDeckJson(
      ["prd", "create", "--project", "WEB", "--title", "Web PRD", "--body", "# Web"],
      env,
    );

    const listed = spawnDeckJson(["prd", "list"], env);
    expect(listed.exitCode).toBe(1);
    expect(listed.response.ok).toBe(false);
    if (!listed.response.ok) {
      expect(listed.response.error.code).toBe("no_matching_path");
    }
  });

  test("updates title, body, and status without duplicating and keeps archived PRDs readable", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "UPD", name: "Update" });
    } finally {
      closeDatabase(db);
    }

    const body = `# Updated PRD

## User Stories

7. As a user, I want to list PRDs, so that I can discover requirements.
41. As a user, I want PRD JSON output to include extracted user stories, so that agents can reason about coverage.
`;

    const created = spawnDeckJson<{ publicId: string }>(
      ["prd", "create", "--project", "UPD", "--title", "Original", "--body", "# Original"],
      env,
    );
    expect(created.response.ok).toBe(true);
    const publicId = created.response.ok ? created.response.data.publicId : "";

    const updated = spawnDeckJson<{
      publicId: string;
      title: string;
      status: string;
      bodyMarkdown: string;
      userStories: Array<{ number: number; text: string }>;
    }>(
      ["prd", "update", publicId, "--title", "Updated", "--body", body, "--status", "archived"],
      env,
    );

    expect(updated.exitCode).toBe(0);
    expect(updated.response.ok).toBe(true);
    if (updated.response.ok) {
      expect(updated.response.data.publicId).toBe(publicId);
      expect(updated.response.data.title).toBe("Updated");
      expect(updated.response.data.status).toBe("archived");
      expect(updated.response.data.bodyMarkdown).toBe(body);
      expect(updated.response.data.userStories.map((story) => story.number)).toEqual([7, 41]);
    }

    const shown = spawnDeckJson<{
      publicId: string;
      status: string;
      userStories: Array<{ number: number; text: string }>;
    }>(["prd", "show", publicId], env);
    expect(shown.exitCode).toBe(0);
    expect(shown.response.ok).toBe(true);
    if (shown.response.ok) {
      expect(shown.response.data.status).toBe("archived");
      expect(shown.response.data.userStories).toHaveLength(2);
    }

    const list = spawnDeckJson<{ count: number }>(
      ["prd", "list", "--project", "UPD", "--status", "archived"],
      env,
    );
    expect(list.response.ok).toBe(true);
    if (list.response.ok) {
      expect(list.response.data.count).toBe(1);
    }
  });
});
