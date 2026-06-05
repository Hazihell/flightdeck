import type { QueueMode } from "../issues/types.ts";

export const PROMPT_MODES = ["plan", "implement", "review", "address-review"] as const;

export type PromptMode = (typeof PROMPT_MODES)[number];

export function isPromptMode(value: string): value is PromptMode {
  return (PROMPT_MODES as readonly string[]).includes(value);
}

export type PromptPrdContext = {
  publicId: string;
  projectKey: string | null;
  title: string;
  status: string;
  bodyMarkdown: string;
  coveredUserStories: Array<{ number: number; text: string | null }>;
  missingUserStoryNumbers: number[];
};

export type PromptInput = {
  mode: PromptMode;
  publicId: string;
  projectKey: string;
  projectName: string;
  projectInstructions: string | null;
  repositoryPath: string | null;
  linkedPrd: PromptPrdContext | null;
  issueTitle: string;
  issueBodyMarkdown: string;
  acceptanceCriteria: string[];
  manualBlocker: string;
  dependencyBlockers: Array<{ publicId: string; title: string; workflowStatus: string }>;
  validationSummary: string | null;
  comments: Array<{ bodyMarkdown: string; createdAt: string }>;
  planContent: string | null;
  complexity: string;
  planStatus: string;
  workflowStatus: string;
};

export type PromptOutput = {
  mode: PromptMode;
  publicId: string;
  text: string;
};

export function promptModeToQueueMode(mode: PromptMode): QueueMode {
  return mode;
}
