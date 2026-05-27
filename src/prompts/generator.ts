import {
  sectionAcceptanceCriteria,
  sectionBlockerContext,
  sectionIssueBody,
  sectionIssuePlan,
  sectionModeInstructions,
  sectionProjectContext,
  sectionRepositoryPath,
  sectionRequiredCommands,
  sectionReviewContext,
} from "./contracts.ts";
import type { PromptInput, PromptMode, PromptOutput } from "./types.ts";

const MODE_GOALS: Record<PromptMode, string> = {
  plan: `Create an unambiguous implementation plan for issue ${"{publicId}"} without modifying product code in the registered repository. The plan should be detailed enough for another agent to implement.`,
  implement: `Implement issue ${"{publicId}"} according to the issue body and any approved plan. Move the issue toward review when work is complete.`,
  review: `Review the implementation for issue ${"{publicId}"}. Decide whether to accept, request changes, or leave feedback.`,
  "address-review": `Address review feedback for issue ${"{publicId}"} and prepare the issue for another review cycle.`,
};

function modeGoal(mode: PromptMode, publicId: string): string {
  return MODE_GOALS[mode].replaceAll("{publicId}", publicId);
}

function requiredCommandsForMode(mode: PromptMode, publicId: string): string[] {
  const id = publicId;
  switch (mode) {
    case "plan":
      return [
        `deck issue attach-plan ${id} --body <PLAN_MARKDOWN_OR_PATH>`,
        `deck issue move ${id} --status backlog`,
        `deck issue comment ${id} --body "<planning notes>"`,
      ];
    case "implement":
      return [
        `deck issue move ${id} --status in-progress`,
        `deck issue move ${id} --status needs-review --branch <BRANCH> --commit <REF> --pr-url <URL>`,
        `deck issue comment ${id} --body "<implementation notes>"`,
      ];
    case "review":
      return [
        `deck issue move ${id} --status accepted --validation "<summary>"`,
        `deck issue move ${id} --status changes-requested --validation "<feedback>"`,
        `deck issue comment ${id} --body "<review notes>"`,
      ];
    case "address-review":
      return [
        `deck issue move ${id} --status in-progress`,
        `deck issue move ${id} --status needs-review`,
        `deck issue comment ${id} --body "<changes made>"`,
      ];
  }
}

function modeSpecificInstructions(mode: PromptMode, input: PromptInput): string {
  const lines = [modeGoal(mode, input.publicId), ""];

  if (mode === "plan") {
    lines.push(
      "Produce a markdown plan with clear steps, files to touch, risks, and test strategy.",
      "Do not write plans into the project repository — attach them with `deck issue attach-plan`.",
    );
    if (input.planStatus === "changes-requested") {
      lines.push(
        "Read plan change feedback from the review context below and revise the attached plan.",
      );
    }
  }

  if (mode === "implement") {
    if (input.complexity === "needs-plan" && input.planStatus === "approved") {
      lines.push("Follow the approved issue plan below.");
    }
    lines.push(
      "Update Flightdeck through the CLI commands listed below; do not rely on manual issue tracker edits.",
    );
  }

  if (mode === "review") {
    lines.push(
      "Check acceptance criteria, tests, and scope. Use validation text when moving status.",
    );
  }

  if (mode === "address-review") {
    lines.push(
      "Read prior review feedback from comments and validation summary if present.",
      "Re-submit for review when fixes are complete.",
    );
  }

  return lines.join("\n");
}

function includePlan(mode: PromptMode, input: PromptInput): boolean {
  if (!input.planContent?.trim()) {
    return false;
  }
  return mode === "implement" || mode === "plan" || mode === "address-review";
}

function includeReviewContext(mode: PromptMode, input: PromptInput): boolean {
  if (mode === "address-review" || mode === "review") {
    return true;
  }
  return mode === "plan" && input.planStatus === "changes-requested";
}

export function generatePrompt(input: PromptInput): PromptOutput {
  const unblocked =
    !input.manualBlocker.trim() &&
    input.dependencyBlockers.every((b) => b.workflowStatus === "done");

  const sections = [
    sectionProjectContext(input.projectKey, input.projectName, input.projectInstructions),
    sectionRepositoryPath(input.repositoryPath),
    sectionIssueBody(input.issueBodyMarkdown),
    includePlan(input.mode, input) ? sectionIssuePlan(input.planContent) : "",
    sectionAcceptanceCriteria(input.acceptanceCriteria),
    sectionBlockerContext({
      manualBlocker: input.manualBlocker,
      dependencyBlockers: input.dependencyBlockers,
      unblocked,
    }),
    includeReviewContext(input.mode, input)
      ? sectionReviewContext({
          validationSummary: input.validationSummary,
          comments: input.comments,
        })
      : "",
    sectionModeInstructions(input.mode, modeSpecificInstructions(input.mode, input)),
    sectionRequiredCommands(requiredCommandsForMode(input.mode, input.publicId)),
  ].filter((section) => section.length > 0);

  return {
    mode: input.mode,
    publicId: input.publicId,
    text: sections.join("\n\n"),
  };
}
