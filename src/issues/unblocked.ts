import type { Database } from "bun:sqlite";
import { listBlockerIssues } from "./repository.ts";
import type { Issue } from "./types.ts";

export function isIssueUnblocked(db: Database, issue: Issue): boolean {
  if (issue.manualBlocker.trim().length > 0) {
    return false;
  }

  if (issue.triageRole === "needs-info" || issue.triageRole === "wontfix") {
    return false;
  }

  const blockers = listBlockerIssues(db, issue.id);
  for (const blocker of blockers) {
    if (blocker.workflowStatus !== "done") {
      return false;
    }
  }

  return true;
}
