import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { closeDatabase, openDatabase } from "../db/client.ts";
import { createProject } from "../projects/repository.ts";
import { setupInitializedHome } from "../testing/helpers.ts";
import { createPrd, findPrdByPublicId, isValidPrdStatus } from "./repository.ts";

describe("prd repository", () => {
  test("allocates PRD sequences per project", async () => {
    const { env } = await setupInitializedHome();
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "APP", name: "App" });
      createProject(db, { key: "WEB", name: "Web" });

      const first = createPrd(db, {
        projectKey: "APP",
        title: "First",
        body: "# First",
      });
      const second = createPrd(db, {
        projectKey: "APP",
        title: "Second",
        body: "# Second",
      });
      const otherProject = createPrd(db, {
        projectKey: "WEB",
        title: "Other",
        body: "# Other",
      });

      expect(first.publicId).toBe("APP-PRD-1");
      expect(second.publicId).toBe("APP-PRD-2");
      expect(otherProject.publicId).toBe("WEB-PRD-1");
    } finally {
      closeDatabase(db);
    }
  });

  test("defaults status to active and validates explicit statuses", async () => {
    const { env } = await setupInitializedHome();
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "STS", name: "Statuses" });

      const defaulted = createPrd(db, {
        projectKey: "STS",
        title: "Default",
        body: "# Default",
      });
      const draft = createPrd(db, {
        projectKey: "STS",
        title: "Draft",
        body: "# Draft",
        status: "draft",
      });

      expect(defaulted.status).toBe("active");
      expect(draft.status).toBe("draft");
      expect(isValidPrdStatus("archived")).toBe(true);
      expect(isValidPrdStatus("done")).toBe(false);
    } finally {
      closeDatabase(db);
    }
  });

  test("finds PRDs by public ID case-insensitively", async () => {
    const { env } = await setupInitializedHome();
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "CAS", name: "Case" });
      createPrd(db, {
        projectKey: "cas",
        title: "Case insensitive",
        body: "# Body",
      });

      expect(findPrdByPublicId(db, "cas-prd-1")?.title).toBe("Case insensitive");
    } finally {
      closeDatabase(db);
    }
  });

  test("reads PRD body from file path and preserves exact content", async () => {
    const { env } = await setupInitializedHome();
    const dir = await mkdtemp(join(tmpdir(), "flightdeck-prd-"));
    const path = join(dir, "prd.md");
    const body = "# PRD\n\nKeep trailing newline.\n";
    await writeFile(path, body);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      createProject(db, { key: "FIL", name: "File" });
      const prd = createPrd(db, {
        projectKey: "FIL",
        title: "File PRD",
        body: path,
      });

      expect(prd.bodyMarkdown).toBe(body);
    } finally {
      closeDatabase(db);
    }
  });
});
