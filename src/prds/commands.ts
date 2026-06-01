import type { Database } from "../db/client.ts";
import { withTransaction } from "../db/client.ts";
import type { CommandResult } from "../projects/commands.ts";
import { inferProjectFromCwd } from "../projects/repository.ts";
import {
  createPrd,
  findPrdByPublicId,
  getProjectKeyForPrd,
  isValidPrdStatus,
  PrdRepositoryError,
} from "./repository.ts";
import type { Prd } from "./types.ts";

export function runPrdCreate(
  db: Database,
  input: {
    projectKey?: string;
    cwd: string;
    title: string;
    body?: string;
    status?: string;
  },
): CommandResult {
  if (!input.title.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --title" },
    };
  }

  if (!input.body?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --body" },
    };
  }

  if (input.status && !isValidPrdStatus(input.status)) {
    return {
      ok: false,
      error: { code: "invalid_input", message: `Invalid PRD status: ${input.status}` },
    };
  }

  const projectKey = resolveProjectKey(db, input.projectKey, input.cwd);
  if (!projectKey.ok) {
    return { ok: false, error: projectKey.error };
  }

  try {
    const prd = withTransaction(db, () =>
      createPrd(db, {
        projectKey: projectKey.key,
        title: input.title,
        body: input.body!,
        status: input.status as Prd["status"] | undefined,
      }),
    );
    return { ok: true, data: prdToOutput(db, prd) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export function runPrdShow(db: Database, publicId: string): CommandResult {
  if (!publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing PRD public ID" },
    };
  }

  const prd = findPrdByPublicId(db, publicId);
  if (!prd) {
    return {
      ok: false,
      error: { code: "prd_not_found", message: `PRD not found: ${publicId}` },
    };
  }

  return { ok: true, data: prdToOutput(db, prd) };
}

function resolveProjectKey(
  db: Database,
  projectKey: string | undefined,
  cwd: string,
): { ok: true; key: string } | { ok: false; error: { code: string; message: string } } {
  if (projectKey?.trim()) {
    return { ok: true, key: projectKey.trim() };
  }

  const inferred = inferProjectFromCwd(db, cwd);
  if (!inferred.ok) {
    return {
      ok: false,
      error: {
        code: inferred.code,
        message: inferred.message,
      },
    };
  }

  return { ok: true, key: inferred.project.key };
}

function prdToOutput(db: Database, prd: Prd): Record<string, unknown> {
  return {
    kind: "prd",
    id: prd.id,
    publicId: prd.publicId,
    projectId: prd.projectId,
    projectKey: getProjectKeyForPrd(db, prd),
    sequence: prd.sequence,
    title: prd.title,
    status: prd.status,
    bodyMarkdown: prd.bodyMarkdown,
    createdAt: prd.createdAt,
    updatedAt: prd.updatedAt,
  };
}

function repositoryErrorToResult(error: unknown): CommandResult {
  if (error instanceof PrdRepositoryError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message },
    };
  }
  throw error;
}
