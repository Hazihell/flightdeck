export const TRIAGE_ROLES = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
] as const;

export type TriageRole = (typeof TRIAGE_ROLES)[number];

export const WORKFLOW_STATUSES = [
  "backlog",
  "in-progress",
  "needs-review",
  "changes-requested",
  "accepted",
  "done",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const COMPLEXITY_VALUES = ["simple", "needs-plan"] as const;

export type Complexity = (typeof COMPLEXITY_VALUES)[number];

export const PLAN_STATUSES = [
  "none",
  "attached",
  "changes-requested",
  "approved",
] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const QUEUE_MODES = [
  "plan",
  "implement",
  "review",
  "address-review",
] as const;

export type QueueMode = (typeof QUEUE_MODES)[number];

export const DEFAULT_TRIAGE_ROLE: TriageRole = "needs-triage";
export const DEFAULT_WORKFLOW_STATUS: WorkflowStatus = "backlog";
export const DEFAULT_COMPLEXITY: Complexity = "simple";
export const DEFAULT_PLAN_STATUS: PlanStatus = "none";

export type Issue = {
  id: string;
  publicId: string;
  projectId: string;
  sequence: number;
  title: string;
  bodyMarkdown: string;
  triageRole: TriageRole;
  workflowStatus: WorkflowStatus;
  workType: string | null;
  complexity: Complexity;
  planStatus: PlanStatus;
  manualBlocker: string;
  branch: string | null;
  worktreePath: string | null;
  commitRef: string | null;
  prUrl: string | null;
  validationSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IssueComment = {
  id: string;
  issueId: string;
  bodyMarkdown: string;
  createdAt: string;
  updatedAt: string;
};

export type IssueDependency = {
  id: string;
  issueId: string;
  blockerIssueId: string;
  createdAt: string;
};

export type ParsedIssueMarkdown = {
  parent: string | null;
  whatToBuild: string | null;
  acceptanceCriteria: string[];
  blockedByRaw: string | null;
  dependencyPublicIds: string[];
  manualBlockerFromMarkdown: string | null;
};
