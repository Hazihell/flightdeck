/** Stable section headings for snapshot tests and agent parsing. */
export const PROMPT_SECTIONS = {
  projectContext: "## Project context",
  repositoryPath: "## Repository path",
  issueBody: "## Issue body",
  issuePlan: "## Issue plan",
  acceptanceCriteria: "## Acceptance criteria",
  blockerContext: "## Blocker context",
  reviewContext: "## Review context",
  modeInstructions: "## Mode instructions",
  requiredCommands: "## Required Flightdeck commands",
} as const;

export function sectionProjectContext(
  projectKey: string,
  projectName: string,
  instructions: string | null,
): string {
  const lines = [
    PROMPT_SECTIONS.projectContext,
    "",
    `- Project key: ${projectKey}`,
    `- Project name: ${projectName}`,
  ];
  if (instructions?.trim()) {
    lines.push("", "### Project instructions", "", instructions.trim());
  }
  return lines.join("\n");
}

export function sectionRepositoryPath(path: string | null): string {
  return [
    PROMPT_SECTIONS.repositoryPath,
    "",
    path?.trim()
      ? path.trim()
      : "(no registered repository path — register one with `deck project path add`)",
  ].join("\n");
}

export function sectionIssueBody(bodyMarkdown: string): string {
  return [PROMPT_SECTIONS.issueBody, "", bodyMarkdown.trim()].join("\n");
}

export function sectionIssuePlan(content: string | null): string {
  if (!content?.trim()) {
    return "";
  }
  return [PROMPT_SECTIONS.issuePlan, "", content.trim()].join("\n");
}

export function sectionAcceptanceCriteria(criteria: string[]): string {
  if (criteria.length === 0) {
    return "";
  }
  const items = criteria.map((item) => `- [ ] ${item}`);
  return [PROMPT_SECTIONS.acceptanceCriteria, "", ...items].join("\n");
}

export function sectionBlockerContext(input: {
  manualBlocker: string;
  dependencyBlockers: Array<{ publicId: string; title: string; workflowStatus: string }>;
  unblocked: boolean;
}): string {
  const lines = [
    PROMPT_SECTIONS.blockerContext,
    "",
    `- Unblocked: ${input.unblocked ? "yes" : "no"}`,
  ];

  if (input.manualBlocker.trim()) {
    lines.push(`- Manual blocker: ${input.manualBlocker.trim()}`);
  }

  if (input.dependencyBlockers.length > 0) {
    lines.push("- Dependency blockers:");
    for (const blocker of input.dependencyBlockers) {
      lines.push(`  - ${blocker.publicId}: ${blocker.title} [${blocker.workflowStatus}]`);
    }
  } else {
    lines.push("- Dependency blockers: none");
  }

  return lines.join("\n");
}

export function sectionReviewContext(input: {
  validationSummary: string | null;
  comments: Array<{ bodyMarkdown: string; createdAt: string }>;
}): string {
  const hasValidation = Boolean(input.validationSummary?.trim());
  const hasComments = input.comments.length > 0;
  if (!hasValidation && !hasComments) {
    return "";
  }

  const lines = [PROMPT_SECTIONS.reviewContext, ""];

  if (hasValidation) {
    lines.push("### Validation summary", "", input.validationSummary!.trim(), "");
  }

  if (hasComments) {
    lines.push("### Comments (chronological)", "");
    for (const comment of input.comments) {
      lines.push(`#### ${comment.createdAt}`, "", comment.bodyMarkdown.trim(), "");
    }
  }

  return lines.join("\n").trimEnd();
}

export function sectionModeInstructions(mode: string, instructions: string): string {
  return [PROMPT_SECTIONS.modeInstructions, "", `Mode: ${mode}`, "", instructions.trim()].join(
    "\n",
  );
}

export function sectionRequiredCommands(commands: string[]): string {
  const lines = [PROMPT_SECTIONS.requiredCommands, ""];
  for (const command of commands) {
    lines.push(command);
  }
  return lines.join("\n");
}
