import type { Database } from "bun:sqlite";
import { listIssues } from "./repository.ts";
import { isIssueUnblocked } from "./unblocked.ts";
import type { Issue, PlanStatus, QueueMode } from "./types.ts";

export function matchesQueueMode(
  db: Database,
  issue: Issue,
  mode: QueueMode,
): boolean {
  if (mode === "review") {
    return issue.workflowStatus === "needs-review";
  }

  if (mode === "address-review") {
    return issue.workflowStatus === "changes-requested" && isIssueUnblocked(db, issue);
  }

  if (mode === "plan") {
    return (
      issue.triageRole === "ready-for-agent" &&
      issue.workflowStatus === "backlog" &&
      issue.complexity === "needs-plan" &&
      planStatusEligibleForPlan(issue.planStatus) &&
      isIssueUnblocked(db, issue)
    );
  }

  if (mode === "implement") {
    const planReady =
      issue.complexity === "simple" || issue.planStatus === "approved";
    return (
      issue.triageRole === "ready-for-agent" &&
      issue.workflowStatus === "backlog" &&
      planReady &&
      isIssueUnblocked(db, issue)
    );
  }

  return false;
}

function planStatusEligibleForPlan(planStatus: PlanStatus): boolean {
  return planStatus === "none" || planStatus === "changes-requested";
}

export function selectNextIssue(
  db: Database,
  mode: QueueMode,
  projectKey?: string,
): Issue | null {
  const candidates = listIssues(db, {
    projectKey,
  }).filter((issue) => matchesQueueMode(db, issue, mode));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });

  return candidates[0] ?? null;
}
