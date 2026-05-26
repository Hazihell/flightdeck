export type Project = {
  id: string;
  key: string;
  name: string;
  kind: string;
  instructions: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPath = {
  id: string;
  projectId: string;
  path: string;
  kind: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InferProjectSuccess = {
  ok: true;
  project: Project;
  matchedPath: ProjectPath;
};

export type InferProjectErrorCode =
  | "no_matching_path"
  | "project_not_found";

export type InferProjectFailure = {
  ok: false;
  code: InferProjectErrorCode;
  message: string;
};

export type InferProjectResult = InferProjectSuccess | InferProjectFailure;

export const DEFAULT_PROJECT_KIND = "app";
export const DEFAULT_PATH_KIND = "checkout";
