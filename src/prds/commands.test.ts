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
});
