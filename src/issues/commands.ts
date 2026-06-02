import type { Database } from "../db/client.ts";
import { withTransaction } from "../db/client.ts";
import { extractPrdUserStories } from "../prds/markdown.ts";
import { findPrdById, getProjectKeyForPrd } from "../prds/repository.ts";
import type { CommandResult } from "../projects/commands.ts";
import { findProjectById, inferProjectFromCwd, listProjectPaths } from "../projects/repository.ts";
import { generatePrompt } from "../prompts/generator.ts";
import { isPromptMode, type PromptMode } from "../prompts/types.ts";
import { addIssueComment, listIssueComments } from "./comments.ts";
import { parseIssueMarkdown } from "./markdown.ts";
import {
  approveIssuePlan,
  attachIssuePlan,
  isImplementationPlanReady,
  PlanError,
  readIssuePlan,
  requestIssuePlanChanges,
} from "./plans.ts";
import { selectNextIssue } from "./queues.ts";
import {
  addIssueDependency,
  addMissingDependenciesFromMarkdown,
  createIssue,
  findIssueByPublicId,
  findIssuePrdLinkByIssueId,
  getProjectKeyForIssue,
  IssueRepositoryError,
  isValidComplexity,
  isValidTriageRole,
  isValidWorkflowStatus,
  linkIssueToPrd,
  listBlockerIssues,
  listIssues,
  removeIssueDependency,
  resolveBodyInput,
  unlinkIssueFromPrd,
  updateIssue,
} from "./repository.ts";
import type { Issue } from "./types.ts";
import { QUEUE_MODES, type QueueMode } from "./types.ts";
import { isIssueUnblocked } from "./unblocked.ts";
import { moveIssue, WorkflowError } from "./workflow.ts";

export function runIssueCreate(
  db: Database,
  input: {
    projectKey?: string;
    cwd: string;
    title: string;
    body?: string;
    triageRole?: string;
    workflowStatus?: string;
    complexity?: string;
    blockedBy?: string;
    manualBlocker?: string;
    prd?: string;
    userStories?: string;
  },
): CommandResult {
  if (!input.title.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --title" },
    };
  }

  const projectKey = resolveProjectKey(db, input.projectKey, input.cwd);
  if (!projectKey.ok) {
    return { ok: false, error: projectKey.error };
  }

  if (input.triageRole && !isValidTriageRole(input.triageRole)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `Invalid triage role: ${input.triageRole}`,
      },
    };
  }

  if (input.workflowStatus && !isValidWorkflowStatus(input.workflowStatus)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `Invalid workflow status: ${input.workflowStatus}`,
      },
    };
  }

  if (input.complexity && !isValidComplexity(input.complexity)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `Invalid complexity: ${input.complexity}`,
      },
    };
  }

  const bodyMarkdown = resolveBodyInput(input.body ?? "");
  const parsed = parseIssueMarkdown(bodyMarkdown);
  const selectedPrd = input.prd?.trim() || parsed.prdPublicIdFromMarkdown || undefined;

  const userStoryNumbers = input.userStories?.trim()
    ? parseUserStoryNumbers(input.userStories)
    : { ok: true as const, numbers: parsed.userStoryNumbersFromMarkdown };
  if (!userStoryNumbers.ok) {
    return { ok: false, error: userStoryNumbers.error };
  }

  if (userStoryNumbers.numbers.length > 0 && !selectedPrd) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "--user-stories requires --prd",
      },
    };
  }

  const warnings: OutputWarning[] = [];

  try {
    const issue = withTransaction(db, () =>
      createIssue(db, {
        projectKey: projectKey.key,
        title: input.title,
        body: bodyMarkdown,
        triageRole: input.triageRole as Issue["triageRole"] | undefined,
        workflowStatus: input.workflowStatus as Issue["workflowStatus"] | undefined,
        complexity: input.complexity as Issue["complexity"] | undefined,
        manualBlocker: input.manualBlocker,
        blockedByPublicIds: input.blockedBy ? [input.blockedBy.trim().toUpperCase()] : undefined,
        prdPublicId: selectedPrd,
        userStoryNumbers: userStoryNumbers.numbers,
      }),
    );
    warnings.push(...collectLinkedPrdWarnings(db, issue));
    return { ok: true, data: withWarnings(issueToOutput(db, issue), warnings) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export function runIssueList(
  db: Database,
  input: {
    projectKey?: string;
    workflowStatus?: string;
    triageRole?: string;
  },
): CommandResult {
  if (input.workflowStatus && !isValidWorkflowStatus(input.workflowStatus)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `Invalid workflow status: ${input.workflowStatus}`,
      },
    };
  }

  if (input.triageRole && !isValidTriageRole(input.triageRole)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `Invalid triage role: ${input.triageRole}`,
      },
    };
  }

  const issues = listIssues(db, {
    projectKey: input.projectKey,
    workflowStatus: input.workflowStatus as Issue["workflowStatus"] | undefined,
    triageRole: input.triageRole as Issue["triageRole"] | undefined,
  });

  return {
    ok: true,
    data: {
      issues: issues.map((issue) => issueSummaryToOutput(db, issue)),
      count: issues.length,
    },
  };
}

export function runIssueUpdate(
  db: Database,
  input: {
    publicId: string;
    title?: string;
    body?: string;
    triageRole?: string;
    complexity?: string;
    manualBlocker?: string;
    clearManualBlocker?: boolean;
  },
): CommandResult {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  if (input.title !== undefined && !input.title.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Title cannot be empty" },
    };
  }

  if (input.triageRole && !isValidTriageRole(input.triageRole)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `Invalid triage role: ${input.triageRole}`,
      },
    };
  }

  if (input.complexity && !isValidComplexity(input.complexity)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `Invalid complexity: ${input.complexity}`,
      },
    };
  }

  const issue = findIssueByPublicId(db, input.publicId);
  if (!issue) {
    return {
      ok: false,
      error: {
        code: "issue_not_found",
        message: `Issue not found: ${input.publicId}`,
      },
    };
  }

  const bodyChanged = input.body !== undefined;
  const bodyMarkdown = bodyChanged ? resolveBodyInput(input.body!) : undefined;
  const parsed = bodyMarkdown ? parseIssueMarkdown(bodyMarkdown) : null;

  let manualBlocker: string | undefined;
  if (input.clearManualBlocker) {
    manualBlocker = "";
  } else if (input.manualBlocker !== undefined) {
    manualBlocker = input.manualBlocker.trim();
  } else if (bodyMarkdown) {
    manualBlocker = parsed?.manualBlockerFromMarkdown?.trim() ?? "";
  }

  try {
    const updated = withTransaction(db, () => {
      const next = updateIssue(db, issue.publicId, {
        title: input.title,
        bodyMarkdown,
        triageRole: input.triageRole as Issue["triageRole"] | undefined,
        complexity: input.complexity as Issue["complexity"] | undefined,
        manualBlocker,
      });
      if (parsed && bodyMarkdown) {
        addMissingDependenciesFromMarkdown(db, next.publicId, parsed.dependencyPublicIds);
      }
      return next;
    });
    return { ok: true, data: issueDetailToOutput(db, updated) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export function runIssueBlockBy(
  db: Database,
  input: { publicId: string; blockerPublicId: string },
): CommandResult {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  if (!input.blockerPublicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --issue" },
    };
  }

  try {
    withTransaction(db, () => addIssueDependency(db, input.publicId, input.blockerPublicId));
    const issue = findIssueByPublicId(db, input.publicId);
    if (!issue) {
      return {
        ok: false,
        error: {
          code: "issue_not_found",
          message: `Issue not found: ${input.publicId}`,
        },
      };
    }
    return { ok: true, data: issueDetailToOutput(db, issue) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export function runIssueLinkPrd(
  db: Database,
  input: { publicId: string; prd?: string; userStories?: string },
): CommandResult {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  if (!input.prd?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --prd" },
    };
  }

  const userStoryNumbers = parseUserStoryNumbers(input.userStories);
  if (!userStoryNumbers.ok) {
    return { ok: false, error: userStoryNumbers.error };
  }

  try {
    withTransaction(db, () =>
      linkIssueToPrd(db, input.publicId, input.prd!, userStoryNumbers.numbers),
    );
    const issue = findIssueByPublicId(db, input.publicId);
    if (!issue) {
      return {
        ok: false,
        error: {
          code: "issue_not_found",
          message: `Issue not found: ${input.publicId}`,
        },
      };
    }

    const warnings = collectLinkedPrdWarnings(db, issue);
    return { ok: true, data: withWarnings(issueDetailToOutput(db, issue), warnings) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export function runIssueUnlinkPrd(db: Database, input: { publicId: string }): CommandResult {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  try {
    withTransaction(db, () => unlinkIssueFromPrd(db, input.publicId));
    const issue = findIssueByPublicId(db, input.publicId);
    if (!issue) {
      return {
        ok: false,
        error: {
          code: "issue_not_found",
          message: `Issue not found: ${input.publicId}`,
        },
      };
    }
    return { ok: true, data: issueDetailToOutput(db, issue) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export function runIssueUnblockBy(
  db: Database,
  input: { publicId: string; blockerPublicId: string },
): CommandResult {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  if (!input.blockerPublicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --issue" },
    };
  }

  try {
    withTransaction(db, () => removeIssueDependency(db, input.publicId, input.blockerPublicId));
    const issue = findIssueByPublicId(db, input.publicId);
    if (!issue) {
      return {
        ok: false,
        error: {
          code: "issue_not_found",
          message: `Issue not found: ${input.publicId}`,
        },
      };
    }
    return { ok: true, data: issueDetailToOutput(db, issue) };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export function runIssueRequestPlanChanges(
  db: Database,
  input: { publicId: string; validation?: string },
): CommandResult {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  try {
    const issue = withTransaction(db, () =>
      requestIssuePlanChanges(db, input.publicId, input.validation),
    );
    return { ok: true, data: issueDetailToOutput(db, issue) };
  } catch (error) {
    if (error instanceof PlanError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    return repositoryErrorToResult(error);
  }
}

export function runIssueShow(db: Database, publicId: string): CommandResult {
  if (!publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  const issue = findIssueByPublicId(db, publicId);
  if (!issue) {
    return {
      ok: false,
      error: {
        code: "issue_not_found",
        message: `Issue not found: ${publicId}`,
      },
    };
  }

  return { ok: true, data: issueDetailToOutput(db, issue) };
}

export function runIssueNext(
  db: Database,
  input: {
    mode: string;
    projectKey?: string;
    cwd: string;
  },
): CommandResult {
  if (!input.mode.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --mode" },
    };
  }

  if (!isValidQueueMode(input.mode)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `Invalid mode: ${input.mode}. Expected one of: ${QUEUE_MODES.join(", ")}`,
      },
    };
  }

  let projectKey = input.projectKey?.trim();
  if (!projectKey) {
    const inferred = inferProjectFromCwd(db, input.cwd);
    if (inferred.ok) {
      projectKey = inferred.project.key;
    }
  }

  const issue = selectNextIssue(db, input.mode as QueueMode, projectKey || undefined);

  if (!issue) {
    return {
      ok: true,
      data: {
        issue: null,
        mode: input.mode,
        projectKey: projectKey ?? null,
      },
    };
  }

  return {
    ok: true,
    data: {
      issue: issueDetailToOutput(db, issue),
      mode: input.mode,
      projectKey: getProjectKeyForIssue(db, issue),
    },
  };
}

export function runIssueMove(
  db: Database,
  input: {
    publicId: string;
    status: string;
    validation?: string;
    branch?: string;
    worktreePath?: string;
    commit?: string;
    prUrl?: string;
  },
): CommandResult {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  if (!input.status.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --status" },
    };
  }

  try {
    const issue = withTransaction(db, () =>
      moveIssue(db, {
        publicId: input.publicId,
        status: input.status,
        validation: input.validation,
        branch: input.branch,
        worktreePath: input.worktreePath,
        commit: input.commit,
        prUrl: input.prUrl,
      }),
    );
    return { ok: true, data: issueDetailToOutput(db, issue) };
  } catch (error) {
    if (error instanceof WorkflowError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    return repositoryErrorToResult(error);
  }
}

export function runIssueComment(
  db: Database,
  input: { publicId: string; body?: string },
): CommandResult {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  if (!input.body?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --body" },
    };
  }

  try {
    const comment = withTransaction(db, () => addIssueComment(db, input.publicId, input.body!));
    const issue = findIssueByPublicId(db, input.publicId);
    return {
      ok: true,
      data: {
        comment: {
          id: comment.id,
          bodyMarkdown: comment.bodyMarkdown,
          createdAt: comment.createdAt,
        },
        issue: issue ? issueSummaryToOutput(db, issue) : null,
      },
    };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export async function runIssueAttachPlan(
  db: Database,
  home: string,
  input: { publicId: string; body?: string },
): Promise<CommandResult> {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  if (!input.body?.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --body" },
    };
  }

  try {
    const result = await attachIssuePlan(db, home, input.publicId, input.body!);
    return {
      ok: true,
      data: {
        issue: issueDetailToOutput(db, result.issue),
        planPath: result.relativePath,
      },
    };
  } catch (error) {
    return repositoryErrorToResult(error);
  }
}

export function runIssueApprovePlan(db: Database, publicId: string): CommandResult {
  if (!publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  try {
    const issue = withTransaction(db, () => approveIssuePlan(db, publicId));
    return { ok: true, data: issueDetailToOutput(db, issue) };
  } catch (error) {
    if (error instanceof PlanError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    return repositoryErrorToResult(error);
  }
}

export async function runIssuePrompt(
  db: Database,
  home: string,
  input: {
    publicId: string;
    mode: string;
    repositoryPath?: string;
  },
): Promise<CommandResult> {
  if (!input.publicId.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing issue public ID" },
    };
  }

  if (!input.mode.trim()) {
    return {
      ok: false,
      error: { code: "invalid_input", message: "Missing required flag: --mode" },
    };
  }

  if (!isPromptMode(input.mode)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `Invalid mode: ${input.mode}. Expected one of: plan, implement, review, address-review`,
      },
    };
  }

  const issue = findIssueByPublicId(db, input.publicId);
  if (!issue) {
    return {
      ok: false,
      error: {
        code: "issue_not_found",
        message: `Issue not found: ${input.publicId}`,
      },
    };
  }

  const mode = input.mode as PromptMode;

  if (mode === "implement" && !isImplementationPlanReady(issue)) {
    return {
      ok: false,
      error: {
        code: "plan_not_approved",
        message: `Implementation requires an approved plan for complexity=needs-plan (current plan_status=${issue.planStatus})`,
      },
    };
  }

  const project = findProjectById(db, issue.projectId);
  if (!project) {
    return {
      ok: false,
      error: { code: "project_not_found", message: "Project not found for issue" },
    };
  }

  const parsed = parseIssueMarkdown(issue.bodyMarkdown);
  const blockers = listBlockerIssues(db, issue.id);
  const comments = listIssueComments(db, issue.id);
  const planContent = await readIssuePlan(db, home, issue.publicId);
  const repositoryPath = resolveRepositoryPath(db, issue, input.repositoryPath);

  const prompt = generatePrompt({
    mode,
    publicId: issue.publicId,
    projectKey: project.key,
    projectName: project.name,
    projectInstructions: project.instructions,
    repositoryPath,
    issueTitle: issue.title,
    issueBodyMarkdown: issue.bodyMarkdown,
    acceptanceCriteria: parsed.acceptanceCriteria,
    manualBlocker: issue.manualBlocker,
    dependencyBlockers: blockers.map((blocker) => ({
      publicId: blocker.publicId,
      title: blocker.title,
      workflowStatus: blocker.workflowStatus,
    })),
    validationSummary: issue.validationSummary,
    comments: comments.map((comment) => ({
      bodyMarkdown: comment.bodyMarkdown,
      createdAt: comment.createdAt,
    })),
    planContent,
    complexity: issue.complexity,
    planStatus: issue.planStatus,
    workflowStatus: issue.workflowStatus,
  });

  return {
    ok: true,
    data: {
      mode: prompt.mode,
      publicId: prompt.publicId,
      prompt: prompt.text,
    },
  };
}

function resolveRepositoryPath(db: Database, issue: Issue, overridePath?: string): string | null {
  if (overridePath?.trim()) {
    return overridePath.trim();
  }

  const paths = listProjectPaths(db, issue.projectId);
  if (paths.length === 0) {
    return null;
  }

  const primary = paths.find((p) => p.kind === "primary");
  return (primary ?? paths[0])?.path ?? null;
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

function isValidQueueMode(value: string): value is QueueMode {
  return (QUEUE_MODES as readonly string[]).includes(value);
}

type OutputWarning = {
  code: string;
  message: string;
};

function withWarnings(
  output: Record<string, unknown>,
  warnings: OutputWarning[],
): Record<string, unknown> {
  if (warnings.length === 0) {
    return output;
  }
  return {
    ...output,
    warnings,
  };
}

function archivedPrdWarning(publicId: string): OutputWarning {
  return {
    code: "archived_prd",
    message: `Linked PRD ${publicId} is archived`,
  };
}

function missingUserStoriesWarning(
  prdPublicId: string,
  missingNumbers: number[],
): OutputWarning | null {
  if (missingNumbers.length === 0) {
    return null;
  }
  return {
    code: "missing_user_stories",
    message: `PRD ${prdPublicId} is missing user story reference(s): ${missingNumbers.join(", ")}`,
  };
}

function collectLinkedPrdWarnings(db: Database, issue: Issue): OutputWarning[] {
  const linked = linkedPrdToOutput(db, issue);
  if (!linked) {
    return [];
  }

  const warnings: OutputWarning[] = [];
  if (linked.status === "archived") {
    warnings.push(archivedPrdWarning(String(linked.publicId)));
  }

  const missingWarning = missingUserStoriesWarning(
    String(linked.publicId),
    linked.missingUserStoryNumbers as number[],
  );
  if (missingWarning) {
    warnings.push(missingWarning);
  }

  return warnings;
}

function parseUserStoryNumbers(
  input: string | undefined,
): { ok: true; numbers: number[] } | { ok: false; error: { code: string; message: string } } {
  if (!input?.trim()) {
    return { ok: true, numbers: [] };
  }

  const values = input
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<number>();
  const numbers: number[] = [];

  for (const value of values) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) {
      return {
        ok: false,
        error: {
          code: "invalid_input",
          message: `Invalid user story reference: ${value}`,
        },
      };
    }
    if (!seen.has(number)) {
      seen.add(number);
      numbers.push(number);
    }
  }

  return { ok: true, numbers };
}

function issueToOutput(db: Database, issue: Issue): Record<string, unknown> {
  return {
    ...issueSummaryToOutput(db, issue),
    bodyMarkdown: issue.bodyMarkdown,
  };
}

function issueSummaryToOutput(db: Database, issue: Issue): Record<string, unknown> {
  return {
    kind: "issue",
    id: issue.id,
    publicId: issue.publicId,
    projectId: issue.projectId,
    projectKey: getProjectKeyForIssue(db, issue),
    sequence: issue.sequence,
    title: issue.title,
    triageRole: issue.triageRole,
    workflowStatus: issue.workflowStatus,
    complexity: issue.complexity,
    planStatus: issue.planStatus,
    manualBlocker: issue.manualBlocker,
    unblocked: isIssueUnblocked(db, issue),
    linkedPrd: linkedPrdToOutput(db, issue),
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

function linkedPrdToOutput(db: Database, issue: Issue): Record<string, unknown> | null {
  const link = findIssuePrdLinkByIssueId(db, issue.id);
  if (!link) {
    return null;
  }

  const prd = findPrdById(db, link.prdId);
  if (!prd) {
    return null;
  }

  const storiesByNumber = new Map(
    extractPrdUserStories(prd.bodyMarkdown).map((story) => [story.number, story.text]),
  );
  const userStories = link.userStoryNumbers.map((number) => ({
    number,
    text: storiesByNumber.get(number) ?? null,
  }));

  return {
    id: prd.id,
    publicId: prd.publicId,
    projectId: prd.projectId,
    projectKey: getProjectKeyForPrd(db, prd),
    title: prd.title,
    status: prd.status,
    userStoryNumbers: link.userStoryNumbers,
    userStories,
    missingUserStoryNumbers: link.userStoryNumbers.filter((number) => !storiesByNumber.has(number)),
  };
}

function issueDetailToOutput(db: Database, issue: Issue): Record<string, unknown> {
  const parsed = parseIssueMarkdown(issue.bodyMarkdown);
  const blockers = listBlockerIssues(db, issue.id);

  return {
    ...issueSummaryToOutput(db, issue),
    bodyMarkdown: issue.bodyMarkdown,
    workType: issue.workType,
    branch: issue.branch,
    worktreePath: issue.worktreePath,
    commitRef: issue.commitRef,
    prUrl: issue.prUrl,
    validationSummary: issue.validationSummary,
    parsed: {
      parent: parsed.parent,
      whatToBuild: parsed.whatToBuild,
      acceptanceCriteria: parsed.acceptanceCriteria,
      blockedByRaw: parsed.blockedByRaw,
      dependencyPublicIds: parsed.dependencyPublicIds,
      manualBlockerFromMarkdown: parsed.manualBlockerFromMarkdown,
    },
    dependencyBlockers: blockers.map((blocker) => ({
      publicId: blocker.publicId,
      workflowStatus: blocker.workflowStatus,
      title: blocker.title,
    })),
  };
}

function repositoryErrorToResult(error: unknown): CommandResult {
  if (error instanceof IssueRepositoryError) {
    return {
      ok: false,
      error: { code: error.code, message: error.message },
    };
  }
  if (error instanceof WorkflowError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  if (error instanceof PlanError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  throw error;
}
