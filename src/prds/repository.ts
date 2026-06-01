import { randomUUID } from "node:crypto";

import type { Database } from "../db/client.ts";
import { resolveMarkdownBodyInput } from "../markdown-body.ts";
import { findProjectById, findProjectByKey } from "../projects/repository.ts";
import { nowIso } from "../time.ts";
import { DEFAULT_PRD_STATUS, PRD_STATUSES, type Prd, type PrdStatus } from "./types.ts";

type PrdRow = {
  id: string;
  public_id: string;
  project_id: string;
  sequence: number;
  title: string;
  status: string;
  body_markdown: string;
  created_at: string;
  updated_at: string;
};

function mapPrd(row: PrdRow): Prd {
  return {
    id: row.id,
    publicId: row.public_id,
    projectId: row.project_id,
    sequence: row.sequence,
    title: row.title,
    status: row.status as PrdStatus,
    bodyMarkdown: row.body_markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function allocatePrdSequence(db: Database, projectId: string): number {
  const existing = db
    .query<{ next_sequence: number }, [string]>(
      "SELECT next_sequence FROM project_prd_sequences WHERE project_id = ?",
    )
    .get(projectId);

  if (!existing) {
    db.query("INSERT INTO project_prd_sequences (project_id, next_sequence) VALUES (?, ?)").run(
      projectId,
      2,
    );
    return 1;
  }

  const sequence = existing.next_sequence;
  db.query(
    "UPDATE project_prd_sequences SET next_sequence = next_sequence + 1 WHERE project_id = ?",
  ).run(projectId);
  return sequence;
}

export function formatPrdPublicId(projectKey: string, sequence: number): string {
  return `${projectKey}-PRD-${sequence}`;
}

export function createPrd(
  db: Database,
  input: {
    projectKey: string;
    title: string;
    body: string;
    status?: PrdStatus;
  },
): Prd {
  const project = findProjectByKey(db, input.projectKey);
  if (!project) {
    throw new PrdRepositoryError("project_not_found", `Project not found: ${input.projectKey}`);
  }

  const sequence = allocatePrdSequence(db, project.id);
  const timestamp = nowIso();
  const prd: Prd = {
    id: randomUUID(),
    publicId: formatPrdPublicId(project.key, sequence),
    projectId: project.id,
    sequence,
    title: input.title.trim(),
    status: input.status ?? DEFAULT_PRD_STATUS,
    bodyMarkdown: resolveMarkdownBodyInput(input.body),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.query(
    `INSERT INTO prds (
      id, public_id, project_id, sequence, title, status, body_markdown, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    prd.id,
    prd.publicId,
    prd.projectId,
    prd.sequence,
    prd.title,
    prd.status,
    prd.bodyMarkdown,
    prd.createdAt,
    prd.updatedAt,
  );

  return prd;
}

export type PrdListFilters = {
  projectKey?: string;
  statuses?: PrdStatus[];
};

export function listPrds(db: Database, filters: PrdListFilters = {}): Prd[] {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filters.projectKey) {
    const project = findProjectByKey(db, filters.projectKey);
    if (!project) {
      return [];
    }
    clauses.push("prds.project_id = ?");
    params.push(project.id);
  }

  if (filters.statuses && filters.statuses.length > 0) {
    clauses.push(`prds.status IN (${filters.statuses.map(() => "?").join(", ")})`);
    params.push(...filters.statuses);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .query<PrdRow, string[]>(
      `SELECT prds.*
       FROM prds
       JOIN projects ON projects.id = prds.project_id
       ${where}
       ORDER BY projects.key ASC, prds.sequence ASC`,
    )
    .all(...params);
  return rows.map(mapPrd);
}

export function findPrdByPublicId(db: Database, publicId: string): Prd | null {
  const normalized = publicId.trim().toUpperCase();
  const row = db.query<PrdRow, [string]>("SELECT * FROM prds WHERE public_id = ?").get(normalized);
  return row ? mapPrd(row) : null;
}

export function findPrdById(db: Database, id: string): Prd | null {
  const row = db.query<PrdRow, [string]>("SELECT * FROM prds WHERE id = ?").get(id);
  return row ? mapPrd(row) : null;
}

export function updatePrd(
  db: Database,
  publicId: string,
  patch: {
    title?: string;
    body?: string;
    status?: PrdStatus;
  },
): Prd {
  const prd = findPrdByPublicId(db, publicId);
  if (!prd) {
    throw new PrdRepositoryError("prd_not_found", `PRD not found: ${publicId}`);
  }

  const updated: Prd = {
    ...prd,
    title: patch.title !== undefined ? patch.title.trim() : prd.title,
    bodyMarkdown:
      patch.body !== undefined ? resolveMarkdownBodyInput(patch.body) : prd.bodyMarkdown,
    status: patch.status ?? prd.status,
    updatedAt: nowIso(),
  };

  db.query(
    `UPDATE prds SET
      title = ?,
      status = ?,
      body_markdown = ?,
      updated_at = ?
     WHERE id = ?`,
  ).run(updated.title, updated.status, updated.bodyMarkdown, updated.updatedAt, updated.id);

  return updated;
}

export function getProjectKeyForPrd(db: Database, prd: Prd): string | null {
  const project = findProjectById(db, prd.projectId);
  return project?.key ?? null;
}

export function isValidPrdStatus(value: string): value is PrdStatus {
  return (PRD_STATUSES as readonly string[]).includes(value);
}

export type PrdRepositoryErrorCode = "project_not_found" | "prd_not_found";

export class PrdRepositoryError extends Error {
  readonly code: PrdRepositoryErrorCode;

  constructor(code: PrdRepositoryErrorCode, message: string) {
    super(message);
    this.name = "PrdRepositoryError";
    this.code = code;
  }
}
