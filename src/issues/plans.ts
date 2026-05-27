import type { Database } from "../db/client.ts";
import { withTransaction } from "../db/client.ts";
import {
  findDocumentById,
  findIssueDocumentLink,
  linkDocumentToIssue,
  planRelativePath,
  readMarkdownDocument,
  upsertDocument,
  writeMarkdownDocument,
} from "../documents/repository.ts";
import {
  findIssueByPublicId,
  IssueRepositoryError,
  resolveBodyInput,
  updateIssue,
} from "./repository.ts";
import type { Issue, PlanStatus } from "./types.ts";

export class PlanError extends Error {
  readonly code: "plan_not_attached" | "invalid_plan_status";

  constructor(code: "plan_not_attached" | "invalid_plan_status", message: string) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
}

export async function attachIssuePlan(
  db: Database,
  home: string,
  publicId: string,
  body: string,
): Promise<{ issue: Issue; relativePath: string }> {
  const issue = findIssueByPublicId(db, publicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${publicId}`);
  }

  const content = resolveBodyInput(body);
  const relativePath = planRelativePath(issue.publicId);
  await writeMarkdownDocument(home, relativePath, content);

  const updated = withTransaction(db, () => {
    const document = upsertDocument(db, { kind: "plan", relativePath });
    linkDocumentToIssue(db, {
      issueId: issue.id,
      documentId: document.id,
      linkKind: "plan",
    });
    return updateIssue(db, issue.publicId, { planStatus: "attached" });
  });

  return { issue: updated, relativePath };
}

export async function readIssuePlan(
  db: Database,
  home: string,
  publicId: string,
): Promise<string | null> {
  const issue = findIssueByPublicId(db, publicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${publicId}`);
  }

  const link = findIssueDocumentLink(db, issue.id, "plan");
  if (!link) {
    return null;
  }

  const document = findDocumentById(db, link.documentId);
  if (!document) {
    return null;
  }

  return readMarkdownDocument(home, document.relativePath);
}

export function requestIssuePlanChanges(
  db: Database,
  publicId: string,
  validation?: string,
): Issue {
  const issue = findIssueByPublicId(db, publicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${publicId}`);
  }

  if (issue.planStatus !== "attached" && issue.planStatus !== "approved") {
    throw new PlanError(
      "invalid_plan_status",
      `Cannot request plan changes from status: ${issue.planStatus}`,
    );
  }

  const link = findIssueDocumentLink(db, issue.id, "plan");
  if (!link) {
    throw new PlanError("plan_not_attached", `No plan attached for issue: ${publicId}`);
  }

  return updateIssue(db, issue.publicId, {
    planStatus: "changes-requested",
    validationSummary: validation?.trim() ? validation.trim() : issue.validationSummary,
  });
}

export function approveIssuePlan(db: Database, publicId: string): Issue {
  const issue = findIssueByPublicId(db, publicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${publicId}`);
  }

  if (issue.planStatus !== "attached" && issue.planStatus !== "changes-requested") {
    throw new PlanError(
      "invalid_plan_status",
      `Cannot approve plan from status: ${issue.planStatus}`,
    );
  }

  const link = findIssueDocumentLink(db, issue.id, "plan");
  if (!link) {
    throw new PlanError("plan_not_attached", `No plan attached for issue: ${publicId}`);
  }

  return updateIssue(db, issue.publicId, { planStatus: "approved" });
}

export function isImplementationPlanReady(issue: Issue): boolean {
  return issue.complexity === "simple" || issue.planStatus === "approved";
}

export function isValidPlanStatusForApproval(status: PlanStatus): boolean {
  return status === "attached" || status === "changes-requested";
}
