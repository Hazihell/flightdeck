import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import type { Database } from "../db/client.ts";
import { findProjectById, findProjectByKey } from "../projects/repository.ts";
import { nowIso } from "../time.ts";
import { DEFAULT_ISSUE_BODY, parseIssueMarkdown } from "./markdown.ts";
import {
  COMPLEXITY_VALUES,
  type Complexity,
  DEFAULT_COMPLEXITY,
  DEFAULT_PLAN_STATUS,
  DEFAULT_TRIAGE_ROLE,
  DEFAULT_WORKFLOW_STATUS,
  type Issue,
  type IssueDependency,
  PLAN_STATUSES,
  type PlanStatus,
  TRIAGE_ROLES,
  type TriageRole,
  WORKFLOW_STATUSES,
  type WorkflowStatus,
} from "./types.ts";

type IssueRow = {
  id: string;
  public_id: string;
  project_id: string;
  sequence: number;
  title: string;
  body_markdown: string;
  triage_role: string;
  workflow_status: string;
  work_type: string | null;
  complexity: string;
  plan_status: string;
  manual_blocker: string;
  branch: string | null;
  worktree_path: string | null;
  commit_ref: string | null;
  pr_url: string | null;
  validation_summary: string | null;
  created_at: string;
  updated_at: string;
};

type DependencyRow = {
  id: string;
  issue_id: string;
  blocker_issue_id: string;
  created_at: string;
};

export type IssueListFilters = {
  projectKey?: string;
  workflowStatus?: WorkflowStatus;
  triageRole?: TriageRole;
};

export function mapIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    publicId: row.public_id,
    projectId: row.project_id,
    sequence: row.sequence,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    triageRole: row.triage_role as TriageRole,
    workflowStatus: row.workflow_status as WorkflowStatus,
    workType: row.work_type,
    complexity: row.complexity as Complexity,
    planStatus: row.plan_status as PlanStatus,
    manualBlocker: row.manual_blocker,
    branch: row.branch,
    worktreePath: row.worktree_path,
    commitRef: row.commit_ref ?? null,
    prUrl: row.pr_url,
    validationSummary: row.validation_summary ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDependency(row: DependencyRow): IssueDependency {
  return {
    id: row.id,
    issueId: row.issue_id,
    blockerIssueId: row.blocker_issue_id,
    createdAt: row.created_at,
  };
}

export function resolveBodyInput(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return DEFAULT_ISSUE_BODY;
  }
  if (existsSync(trimmed)) {
    return readFileSync(trimmed, "utf8");
  }
  return body;
}

function allocateSequence(db: Database, projectId: string): number {
  const existing = db
    .query<{ next_sequence: number }, [string]>(
      "SELECT next_sequence FROM project_issue_sequences WHERE project_id = ?",
    )
    .get(projectId);

  if (!existing) {
    db.query("INSERT INTO project_issue_sequences (project_id, next_sequence) VALUES (?, ?)").run(
      projectId,
      2,
    );
    return 1;
  }

  const sequence = existing.next_sequence;
  db.query(
    "UPDATE project_issue_sequences SET next_sequence = next_sequence + 1 WHERE project_id = ?",
  ).run(projectId);
  return sequence;
}

export function formatPublicId(projectKey: string, sequence: number): string {
  return `${projectKey}-${sequence}`;
}

export function createIssue(
  db: Database,
  input: {
    projectKey: string;
    title: string;
    body?: string;
    triageRole?: TriageRole;
    workflowStatus?: WorkflowStatus;
    complexity?: Complexity;
    planStatus?: PlanStatus;
    manualBlocker?: string;
    blockedByPublicIds?: string[];
  },
): Issue {
  const project = findProjectByKey(db, input.projectKey);
  if (!project) {
    throw new IssueRepositoryError("project_not_found", `Project not found: ${input.projectKey}`);
  }

  const sequence = allocateSequence(db, project.id);
  const publicId = formatPublicId(project.key, sequence);
  const timestamp = nowIso();
  const bodyMarkdown = resolveBodyInput(input.body ?? "");
  const parsed = parseIssueMarkdown(bodyMarkdown);
  const manualBlocker =
    input.manualBlocker !== undefined
      ? input.manualBlocker.trim()
      : (parsed.manualBlockerFromMarkdown?.trim() ?? "");

  const issue: Issue = {
    id: randomUUID(),
    publicId,
    projectId: project.id,
    sequence,
    title: input.title.trim(),
    bodyMarkdown,
    triageRole: input.triageRole ?? DEFAULT_TRIAGE_ROLE,
    workflowStatus: input.workflowStatus ?? DEFAULT_WORKFLOW_STATUS,
    workType: null,
    complexity: input.complexity ?? DEFAULT_COMPLEXITY,
    planStatus: input.planStatus ?? DEFAULT_PLAN_STATUS,
    manualBlocker,
    branch: null,
    worktreePath: null,
    commitRef: null,
    prUrl: null,
    validationSummary: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.query(
    `INSERT INTO issues (
      id, public_id, project_id, sequence, title, body_markdown,
      triage_role, workflow_status, work_type, complexity, plan_status,
      manual_blocker, branch, worktree_path, commit_ref, pr_url,
      validation_summary, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    issue.id,
    issue.publicId,
    issue.projectId,
    issue.sequence,
    issue.title,
    issue.bodyMarkdown,
    issue.triageRole,
    issue.workflowStatus,
    issue.workType,
    issue.complexity,
    issue.planStatus,
    issue.manualBlocker,
    issue.branch,
    issue.worktreePath,
    issue.commitRef,
    issue.prUrl,
    issue.validationSummary,
    issue.createdAt,
    issue.updatedAt,
  );

  const blockedBy = (input.blockedByPublicIds ?? []).map((id) => id.trim().toUpperCase());
  for (const blockerPublicId of blockedBy) {
    addIssueDependency(db, issue.publicId, blockerPublicId);
  }

  const markdownDeps = parsed.dependencyPublicIds.map((id) => id.trim().toUpperCase());
  for (const depId of markdownDeps) {
    if (!blockedBy.includes(depId)) {
      try {
        addIssueDependency(db, issue.publicId, depId);
      } catch {
        // Ignore unresolved markdown references at creation time.
      }
    }
  }

  return findIssueByPublicId(db, issue.publicId) ?? issue;
}

export function findIssueByPublicId(db: Database, publicId: string): Issue | null {
  const normalized = publicId.trim().toUpperCase();
  const row = db
    .query<IssueRow, [string]>("SELECT * FROM issues WHERE public_id = ?")
    .get(normalized);
  return row ? mapIssue(row) : null;
}

export function findIssueById(db: Database, id: string): Issue | null {
  const row = db.query<IssueRow, [string]>("SELECT * FROM issues WHERE id = ?").get(id);
  return row ? mapIssue(row) : null;
}

export function listIssues(db: Database, filters: IssueListFilters = {}): Issue[] {
  const clauses: string[] = [];
  const params: Array<string> = [];

  if (filters.projectKey) {
    const project = findProjectByKey(db, filters.projectKey);
    if (!project) {
      return [];
    }
    clauses.push("project_id = ?");
    params.push(project.id);
  }

  if (filters.workflowStatus) {
    clauses.push("workflow_status = ?");
    params.push(filters.workflowStatus);
  }

  if (filters.triageRole) {
    clauses.push("triage_role = ?");
    params.push(filters.triageRole);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .query<IssueRow, string[]>(
      `SELECT * FROM issues ${where} ORDER BY project_id ASC, sequence ASC`,
    )
    .all(...params);
  return rows.map(mapIssue);
}

export function removeIssueDependency(
  db: Database,
  issuePublicId: string,
  blockerPublicId: string,
): void {
  const issue = findIssueByPublicId(db, issuePublicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${issuePublicId}`);
  }

  const blocker = findIssueByPublicId(db, blockerPublicId);
  if (!blocker) {
    throw new IssueRepositoryError(
      "blocker_not_found",
      `Blocker issue not found: ${blockerPublicId}`,
    );
  }

  db.query(
    `DELETE FROM issue_dependencies
     WHERE issue_id = ? AND blocker_issue_id = ?`,
  ).run(issue.id, blocker.id);
}

export function addMissingDependenciesFromMarkdown(
  db: Database,
  issuePublicId: string,
  dependencyPublicIds: string[],
): void {
  const issue = findIssueByPublicId(db, issuePublicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${issuePublicId}`);
  }

  const existingIds = new Set(listBlockerIssues(db, issue.id).map((blocker) => blocker.publicId));

  for (const depId of dependencyPublicIds.map((id) => id.trim().toUpperCase())) {
    if (!depId || existingIds.has(depId)) {
      continue;
    }
    try {
      addIssueDependency(db, issuePublicId, depId);
      existingIds.add(depId);
    } catch {
      // Ignore unresolved markdown references at update time.
    }
  }
}

export function addIssueDependency(
  db: Database,
  issuePublicId: string,
  blockerPublicId: string,
): IssueDependency {
  const issue = findIssueByPublicId(db, issuePublicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${issuePublicId}`);
  }

  const blocker = findIssueByPublicId(db, blockerPublicId);
  if (!blocker) {
    throw new IssueRepositoryError(
      "blocker_not_found",
      `Blocker issue not found: ${blockerPublicId}`,
    );
  }

  if (issue.id === blocker.id) {
    throw new IssueRepositoryError("invalid_dependency", "An issue cannot block itself");
  }

  const existing = db
    .query<DependencyRow, [string, string]>(
      `SELECT * FROM issue_dependencies
       WHERE issue_id = ? AND blocker_issue_id = ?`,
    )
    .get(issue.id, blocker.id);
  if (existing) {
    return mapDependency(existing);
  }

  const dependency: IssueDependency = {
    id: randomUUID(),
    issueId: issue.id,
    blockerIssueId: blocker.id,
    createdAt: nowIso(),
  };

  db.query(
    `INSERT INTO issue_dependencies (id, issue_id, blocker_issue_id, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(dependency.id, dependency.issueId, dependency.blockerIssueId, dependency.createdAt);

  return dependency;
}

export function listIssueDependencies(db: Database, issueId: string): IssueDependency[] {
  const rows = db
    .query<DependencyRow, [string]>(
      "SELECT * FROM issue_dependencies WHERE issue_id = ? ORDER BY created_at ASC",
    )
    .all(issueId);
  return rows.map(mapDependency);
}

export function listBlockerIssues(db: Database, issueId: string): Issue[] {
  const dependencies = listIssueDependencies(db, issueId);
  const blockers: Issue[] = [];
  for (const dep of dependencies) {
    const blocker = findIssueById(db, dep.blockerIssueId);
    if (blocker) {
      blockers.push(blocker);
    }
  }
  return blockers;
}

export function listAllIssues(db: Database): Issue[] {
  const rows = db
    .query<IssueRow, []>("SELECT * FROM issues ORDER BY project_id ASC, sequence ASC")
    .all();
  return rows.map(mapIssue);
}

export function updateIssue(
  db: Database,
  publicId: string,
  patch: {
    title?: string;
    bodyMarkdown?: string;
    triageRole?: TriageRole;
    workflowStatus?: WorkflowStatus;
    complexity?: Complexity;
    planStatus?: PlanStatus;
    manualBlocker?: string;
    branch?: string | null;
    worktreePath?: string | null;
    commitRef?: string | null;
    prUrl?: string | null;
    validationSummary?: string | null;
  },
): Issue {
  const issue = findIssueByPublicId(db, publicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${publicId}`);
  }

  const updated: Issue = {
    ...issue,
    title: patch.title !== undefined ? patch.title.trim() : issue.title,
    bodyMarkdown: patch.bodyMarkdown !== undefined ? patch.bodyMarkdown : issue.bodyMarkdown,
    triageRole: patch.triageRole ?? issue.triageRole,
    workflowStatus: patch.workflowStatus ?? issue.workflowStatus,
    complexity: patch.complexity ?? issue.complexity,
    planStatus: patch.planStatus ?? issue.planStatus,
    manualBlocker: patch.manualBlocker !== undefined ? patch.manualBlocker : issue.manualBlocker,
    branch: patch.branch !== undefined ? patch.branch : issue.branch,
    worktreePath: patch.worktreePath !== undefined ? patch.worktreePath : issue.worktreePath,
    commitRef: patch.commitRef !== undefined ? patch.commitRef : issue.commitRef,
    prUrl: patch.prUrl !== undefined ? patch.prUrl : issue.prUrl,
    validationSummary:
      patch.validationSummary !== undefined ? patch.validationSummary : issue.validationSummary,
    updatedAt: nowIso(),
  };

  db.query(
    `UPDATE issues SET
      title = ?,
      body_markdown = ?,
      triage_role = ?,
      workflow_status = ?,
      complexity = ?,
      plan_status = ?,
      manual_blocker = ?,
      branch = ?,
      worktree_path = ?,
      commit_ref = ?,
      pr_url = ?,
      validation_summary = ?,
      updated_at = ?
     WHERE id = ?`,
  ).run(
    updated.title,
    updated.bodyMarkdown,
    updated.triageRole,
    updated.workflowStatus,
    updated.complexity,
    updated.planStatus,
    updated.manualBlocker,
    updated.branch,
    updated.worktreePath,
    updated.commitRef,
    updated.prUrl,
    updated.validationSummary,
    updated.updatedAt,
    updated.id,
  );

  return updated;
}

export function isValidTriageRole(value: string): value is TriageRole {
  return (TRIAGE_ROLES as readonly string[]).includes(value);
}

export function isValidWorkflowStatus(value: string): value is WorkflowStatus {
  return (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function isValidComplexity(value: string): value is Complexity {
  return (COMPLEXITY_VALUES as readonly string[]).includes(value);
}

export function isValidPlanStatus(value: string): value is PlanStatus {
  return (PLAN_STATUSES as readonly string[]).includes(value);
}

export type IssueRepositoryErrorCode =
  | "project_not_found"
  | "issue_not_found"
  | "blocker_not_found"
  | "invalid_dependency"
  | "duplicate_dependency";

export class IssueRepositoryError extends Error {
  readonly code: IssueRepositoryErrorCode;

  constructor(code: IssueRepositoryErrorCode, message: string) {
    super(message);
    this.name = "IssueRepositoryError";
    this.code = code;
  }
}

export function getProjectKeyForIssue(db: Database, issue: Issue): string | null {
  const project = findProjectById(db, issue.projectId);
  return project?.key ?? null;
}
