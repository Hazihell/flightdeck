import type { Database } from "../db/client.ts";
import {
  findIssueByPublicId,
  IssueRepositoryError,
  isValidWorkflowStatus,
  updateIssue,
} from "./repository.ts";
import type { Issue, WorkflowStatus } from "./types.ts";

export type MoveIssueInput = {
  publicId: string;
  status: string;
  validation?: string;
  branch?: string;
  worktreePath?: string;
  commit?: string;
  prUrl?: string;
};

export function moveIssue(db: Database, input: MoveIssueInput): Issue {
  if (!isValidWorkflowStatus(input.status)) {
    throw new WorkflowError("invalid_input", `Invalid workflow status: ${input.status}`);
  }

  const issue = findIssueByPublicId(db, input.publicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${input.publicId}`);
  }

  return updateIssue(db, issue.publicId, {
    workflowStatus: input.status as WorkflowStatus,
    validationSummary: input.validation !== undefined ? input.validation.trim() || null : undefined,
    branch: input.branch !== undefined ? input.branch.trim() || null : undefined,
    worktreePath: input.worktreePath !== undefined ? input.worktreePath.trim() || null : undefined,
    commitRef: input.commit !== undefined ? input.commit.trim() || null : undefined,
    prUrl: input.prUrl !== undefined ? input.prUrl.trim() || null : undefined,
  });
}

export class WorkflowError extends Error {
  readonly code: "invalid_input";

  constructor(code: "invalid_input", message: string) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
  }
}
