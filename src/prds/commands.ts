import type { Database } from "../db/client.ts";
import { withTransaction } from "../db/client.ts";
import type { CommandResult } from "../projects/commands.ts";
import { inferProjectFromCwd } from "../projects/repository.ts";
import { extractPrdUserStories } from "./markdown.ts";
import {
  createPrd,
  findPrdByPublicId,
  getProjectKeyForPrd,
  isValidPrdStatus,
  listPrds,
  PrdRepositoryError,
  updatePrd,
} from "./repository.ts";
import { DEFAULT_PRD_STATUS, type Prd, type PrdStatus } from "./types.ts";

const DEFAULT_LIST_STATUSES: PrdStatus[] = ["draft", DEFAULT_PRD_STATUS];

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

export function runPrdList(
  db: Database,
  input: {
    projectKey?: string;
    cwd: string;
    status?: string;
  },
): CommandResult {
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

  const statuses = input.status ? [input.status as PrdStatus] : DEFAULT_LIST_STATUSES;
  const prds = listPrds(db, {
    projectKey: projectKey.key,
    statuses,
  });

  return {
    ok: true,
    data: {
      kind: "prdList",
      count: prds.length,
      filters: {
        projectKey: projectKey.key,
        statuses,
      },
      prds: prds.map((prd) => prdToOutput(db, prd)),
    },
  };
}

export function runPrdUpdate(
  db: Database,
  input: {
    publicId: string;
    title?: string;
    body?: string;
    status?: string;
  },
): CommandResult {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing PRD public ID" },
    };
  }

  if (input.title !== undefined && !input.title.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing value for flag: --title" },
    };
  }

  if (input.body !== undefined && !input.body.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing value for flag: --body" },
    };
  }

  if (input.status !== undefined && !isValidPrdStatus(input.status)) {
    return {
      ok: false,
      error: { code: "invalid_input", message: `Invalid PRD status: ${input.status}` },
    };
  }

  if (input.title === undefined && input.body === undefined && input.status === undefined) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "Provide at least one of --title, --body, or --status",
      },
    };
  }

  try {
    const prd = withTransaction(db, () =>
      updatePrd(db, input.publicId, {
        title: input.title,
        body: input.body,
        status: input.status as PrdStatus | undefined,
      }),
    );
    return { ok: true, data: prdToOutput(db, prd) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
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
    userStories: extractPrdUserStories(prd.bodyMarkdown),
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
