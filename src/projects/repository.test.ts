import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { closeDatabase, openDatabase } from "../db/client.ts";
import { addProjectPath, createProject, findProjectByKey } from "../index.ts";
import { runDeck, setupInitializedHome } from "../testing/helpers.ts";
import { normalizePath, pathMatchesPrefix } from "./paths.ts";
import { inferProjectFromCwd, normalizeProjectKey } from "./repository.ts";

describe("project path matching", () => {
  test("matches child directories but not sibling prefixes", () => {
    expect(pathMatchesPrefix("/repo/app", "/repo")).toBe(true);
    expect(pathMatchesPrefix("/repo", "/repo")).toBe(true);
    expect(pathMatchesPrefix("/repo-other", "/repo")).toBe(false);
  });
});

describe("project registry", () => {
  test("deck project add creates uppercase keys", async () => {
    const isolated = await setupInitializedHome();
    const { env } = isolated;
    const code = await runDeck(
      ["project", "add", "--key", "ola", "--name", "Ola UI", "--kind", "app"],
      isolated,
    );
    expect(code).toBe(0);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const project = findProjectByKey(db, "ola");
      expect(project?.key).toBe("OLA");
      expect(project?.name).toBe("Ola UI");
    } finally {
      closeDatabase(db);
    }
  });

  test("rejects duplicate project keys", async () => {
    const isolated = await setupInitializedHome();
    const args = ["project", "add", "--key", "OLA", "--name", "First"];
    expect(await runDeck(args, isolated)).toBe(0);
    expect(await runDeck(args, isolated)).toBe(1);
  });

  test("deck project path add registers normalized paths", async () => {
    const isolated = await setupInitializedHome();
    const { env, home } = isolated;
    const repoRoot = normalizePath(join(home, "repos", "ola"));
    expect(await runDeck(["project", "add", "--key", "OLA", "--name", "Ola"], isolated)).toBe(0);
    expect(
      await runDeck(
        ["project", "path", "add", "--project", "ola", "--path", repoRoot, "--label", "main"],
        isolated,
      ),
    ).toBe(0);

    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const inferred = inferProjectFromCwd(db, join(repoRoot, "src", "app"));
      expect(inferred.ok).toBe(true);
      if (inferred.ok) {
        expect(inferred.project.key).toBe("OLA");
        expect(inferred.matchedPath.path).toBe(repoRoot);
      }
    } finally {
      closeDatabase(db);
    }
  });

  test("rejects duplicate paths", async () => {
    const isolated = await setupInitializedHome();
    const { env, home } = isolated;
    const repoRoot = join(home, "repos", "dup");
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const project = createProject(db, { key: "DUP", name: "Dup" });
      addProjectPath(db, { projectKey: project.key, path: repoRoot });
      expect(() => addProjectPath(db, { projectKey: project.key, path: repoRoot })).toThrow();
    } finally {
      closeDatabase(db);
    }
  });

  test("infers project by longest matching prefix", async () => {
    const isolated = await setupInitializedHome();
    const { env, home } = isolated;
    const shortRoot = join(home, "work", "mono");
    const longRoot = join(shortRoot, "packages", "app");
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const mono = createProject(db, { key: "MONO", name: "Mono" });
      const app = createProject(db, { key: "APP", name: "App" });
      addProjectPath(db, { projectKey: mono.key, path: shortRoot });
      addProjectPath(db, { projectKey: app.key, path: longRoot });

      const atApp = inferProjectFromCwd(db, join(longRoot, "src"));
      expect(atApp.ok).toBe(true);
      if (atApp.ok) {
        expect(atApp.project.key).toBe("APP");
      }

      const atMono = inferProjectFromCwd(db, join(shortRoot, "docs"));
      expect(atMono.ok).toBe(true);
      if (atMono.ok) {
        expect(atMono.project.key).toBe("MONO");
      }

      const outside = inferProjectFromCwd(db, join(home, "elsewhere"));
      expect(outside.ok).toBe(false);
      if (!outside.ok) {
        expect(outside.code).toBe("no_matching_path");
      }
    } finally {
      closeDatabase(db);
    }
  });

  test("does not infer sibling paths with shared prefixes", async () => {
    const isolated = await setupInitializedHome();
    const { env, home } = isolated;
    const db = openDatabase(env.FLIGHTDECK_HOME!);
    try {
      const project = createProject(db, { key: "REP", name: "Repo" });
      addProjectPath(db, {
        projectKey: project.key,
        path: join(home, "repo"),
      });

      const sibling = inferProjectFromCwd(db, join(home, "repo-other"));
      expect(sibling.ok).toBe(false);
    } finally {
      closeDatabase(db);
    }
  });

  test("normalizeProjectKey uppercases keys", () => {
    expect(normalizeProjectKey("ola")).toBe("OLA");
  });
});
