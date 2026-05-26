import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { nowIso } from "../time.ts";
import { normalizePath, pathMatchesPrefix } from "./paths.ts";
import {
  DEFAULT_PATH_KIND,
  DEFAULT_PROJECT_KIND,
  type InferProjectResult,
  type Project,
  type ProjectPath,
} from "./types.ts";

type ProjectRow = {
  id: string;
  key: string;
  name: string;
  kind: string;
  instructions: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectPathRow = {
  id: string;
  project_id: string;
  path: string;
  kind: string;
  label: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeProjectKey(key: string): string {
  return key.trim().toUpperCase();
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    instructions: row.instructions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectPath(row: ProjectPathRow): ProjectPath {
  return {
    id: row.id,
    projectId: row.project_id,
    path: row.path,
    kind: row.kind,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createProject(
  db: Database,
  input: {
    key: string;
    name: string;
    kind?: string;
    instructions?: string | null;
  },
): Project {
  const key = normalizeProjectKey(input.key);
  const existing = findProjectByKey(db, key);
  if (existing) {
    throw new ProjectRepositoryError("duplicate_key", `Project key already exists: ${key}`);
  }

  const timestamp = nowIso();
  const project: Project = {
    id: randomUUID(),
    key,
    name: input.name.trim(),
    kind: input.kind?.trim() || DEFAULT_PROJECT_KIND,
    instructions: input.instructions ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.query(
    `INSERT INTO projects (id, key, name, kind, instructions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    project.id,
    project.key,
    project.name,
    project.kind,
    project.instructions,
    project.createdAt,
    project.updatedAt,
  );

  return project;
}

export function findProjectByKey(db: Database, key: string): Project | null {
  const normalized = normalizeProjectKey(key);
  const row = db
    .query<ProjectRow, [string]>("SELECT * FROM projects WHERE key = ?")
    .get(normalized);
  return row ? mapProject(row) : null;
}

export function findProjectById(db: Database, id: string): Project | null {
  const row = db
    .query<ProjectRow, [string]>("SELECT * FROM projects WHERE id = ?")
    .get(id);
  return row ? mapProject(row) : null;
}

export function addProjectPath(
  db: Database,
  input: {
    projectKey: string;
    path: string;
    kind?: string;
    label?: string | null;
  },
): ProjectPath {
  const project = findProjectByKey(db, input.projectKey);
  if (!project) {
    throw new ProjectRepositoryError(
      "project_not_found",
      `Project not found: ${normalizeProjectKey(input.projectKey)}`,
    );
  }

  const normalizedPath = normalizePath(input.path);
  const existingPath = db
    .query<ProjectPathRow, [string]>("SELECT * FROM project_paths WHERE path = ?")
    .get(normalizedPath);
  if (existingPath) {
    throw new ProjectRepositoryError(
      "duplicate_path",
      `Path already registered: ${normalizedPath}`,
    );
  }

  const timestamp = nowIso();
  const projectPath: ProjectPath = {
    id: randomUUID(),
    projectId: project.id,
    path: normalizedPath,
    kind: input.kind?.trim() || DEFAULT_PATH_KIND,
    label: input.label?.trim() ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.query(
    `INSERT INTO project_paths (id, project_id, path, kind, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    projectPath.id,
    projectPath.projectId,
    projectPath.path,
    projectPath.kind,
    projectPath.label,
    projectPath.createdAt,
    projectPath.updatedAt,
  );

  return projectPath;
}

export function listProjectPaths(db: Database, projectId: string): ProjectPath[] {
  const rows = db
    .query<ProjectPathRow, [string]>(
      "SELECT * FROM project_paths WHERE project_id = ? ORDER BY path ASC",
    )
    .all(projectId);
  return rows.map(mapProjectPath);
}

export function listAllProjectPaths(db: Database): ProjectPath[] {
  const rows = db
    .query<ProjectPathRow, []>("SELECT * FROM project_paths ORDER BY path ASC")
    .all();
  return rows.map(mapProjectPath);
}

export function inferProjectFromCwd(
  db: Database,
  cwd: string,
): InferProjectResult {
  const paths = listAllProjectPaths(db);
  let best: { path: ProjectPath; length: number } | null = null;

  for (const registered of paths) {
    if (!pathMatchesPrefix(cwd, registered.path)) {
      continue;
    }
    const length = normalizePath(registered.path).length;
    if (!best || length > best.length) {
      best = { path: registered, length };
    }
  }

  if (!best) {
    return {
      ok: false,
      code: "no_matching_path",
      message: `No registered project path matches cwd: ${normalizePath(cwd)}`,
    };
  }

  const project = findProjectById(db, best.path.projectId);
  if (!project) {
    return {
      ok: false,
      code: "project_not_found",
      message: `Project not found for path: ${best.path.id}`,
    };
  }

  return {
    ok: true,
    project,
    matchedPath: best.path,
  };
}

export type ProjectRepositoryErrorCode =
  | "duplicate_key"
  | "duplicate_path"
  | "project_not_found";

export class ProjectRepositoryError extends Error {
  readonly code: ProjectRepositoryErrorCode;

  constructor(code: ProjectRepositoryErrorCode, message: string) {
    super(message);
    this.name = "ProjectRepositoryError";
    this.code = code;
  }
}
