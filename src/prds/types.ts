export const PRD_STATUSES = ["draft", "active", "archived"] as const;

export type PrdStatus = (typeof PRD_STATUSES)[number];

export const DEFAULT_PRD_STATUS: PrdStatus = "active";

export type Prd = {
  id: string;
  publicId: string;
  projectId: string;
  sequence: number;
  title: string;
  status: PrdStatus;
  bodyMarkdown: string;
  createdAt: string;
  updatedAt: string;
};
