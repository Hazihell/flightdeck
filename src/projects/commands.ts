import type { Database } from "../db/client.ts";
import { withTransaction } from "../db/client.ts";
import { addProjectPath, createProject, ProjectRepositoryError } from "./repository.ts";
import type { Project, ProjectPath } from "./types.ts";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string } };

export function runProjectAdd(
  db: Database,
  input: {
    key: string;
    name: string;
    kind?: string;
    instructions?: string;
  },
): CommandResult {
  if (!input.key.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --key" },
    };
  }
  if (!input.name.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --name" },
    };
  }

  try {
    const project = withTransaction(db, () =>
      createProject(db, {
        key: input.key,
        name: input.name,
        kind: input.kind,
        instructions: input.instructions ?? null,
      }),
    );
    return { ok: true, data: projectToOutput(project) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export function runProjectPathAdd(
  db: Database,
  input: {
    projectKey: string;
    path: string;
    kind?: string;
    label?: string;
  },
): CommandResult {
  if (!input.projectKey.trim()) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "Missing required flag: --project",
      },
    };
  }
  if (!input.path.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --path" },
    };
  }

  try {
    const projectPath = withTransaction(db, () =>
      addProjectPath(db, {
        projectKey: input.projectKey,
        path: input.path,
        kind: input.kind,
        label: input.label ?? null,
      }),
    );
    return { ok: true, data: projectPathToOutput(projectPath) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

function projectToOutput(project: Project): Record<string, unknown> {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    kind: project.kind,
    instructions: project.instructions,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function projectPathToOutput(path: ProjectPath): Record<string, unknown> {
  return {
    id: path.id,
    projectId: path.projectId,
    path: path.path,
    kind: path.kind,
    label: path.label,
    createdAt: path.createdAt,
    updatedAt: path.updatedAt,
  };
}

function repositoryErrorToResult(error: unknown): CommandResult {
  if (error instanceof ProjectRepositoryError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message },
    };
  }
  throw error;
}
