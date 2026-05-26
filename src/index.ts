export { runCli, HELP_TEXT } from "./cli.ts";
export { parseArgs, flagString, hasFlag } from "./cli-args.ts";
export {
  resolveFlightdeckHome,
  ensureFlightdeckHome,
  flightdeckDatabasePath,
  DEFAULT_HOME_DIR_NAME,
} from "./home.ts";
export { nowIso } from "./time.ts";
export { initFlightdeck } from "./init.ts";
export {
  openDatabase,
  closeDatabase,
  migrate,
  getAppliedMigrationVersion,
  withTransaction,
  expectedSchemaVersion,
} from "./db/client.ts";
export { SCHEMA_VERSION, MIGRATIONS } from "./db/schema.ts";
export {
  normalizeProjectKey,
  createProject,
  findProjectByKey,
  findProjectById,
  addProjectPath,
  listProjectPaths,
  listAllProjectPaths,
  inferProjectFromCwd,
  ProjectRepositoryError,
} from "./projects/repository.ts";
export { normalizePath, pathMatchesPrefix } from "./projects/paths.ts";
export {
  DEFAULT_PROJECT_KIND,
  DEFAULT_PATH_KIND,
  type Project,
  type ProjectPath,
  type InferProjectResult,
} from "./projects/types.ts";
export { runProjectAdd, runProjectPathAdd } from "./projects/commands.ts";
export {
  parseIssueMarkdown,
  extractPublicIds,
  DEFAULT_ISSUE_BODY,
  PUBLIC_ID_PATTERN,
} from "./issues/markdown.ts";
export {
  createIssue,
  findIssueByPublicId,
  listIssues,
  listAllIssues,
  listBlockerIssues,
  addIssueDependency,
  removeIssueDependency,
  updateIssue,
  resolveBodyInput,
  formatPublicId,
  IssueRepositoryError,
} from "./issues/repository.ts";
export { isIssueUnblocked } from "./issues/unblocked.ts";
export { matchesQueueMode, selectNextIssue } from "./issues/queues.ts";
export {
  runIssueCreate,
  runIssueList,
  runIssueShow,
  runIssueNext,
  runIssueMove,
  runIssueComment,
  runIssueAttachPlan,
  runIssueApprovePlan,
  runIssueBlockBy,
  runIssuePrompt,
  runIssueRequestPlanChanges,
  runIssueUnblockBy,
  runIssueUpdate,
} from "./issues/commands.ts";
export { moveIssue, WorkflowError } from "./issues/workflow.ts";
export { addIssueComment, listIssueComments } from "./issues/comments.ts";
export {
  attachIssuePlan,
  approveIssuePlan,
  requestIssuePlanChanges,
  readIssuePlan,
  isImplementationPlanReady,
  PlanError,
} from "./issues/plans.ts";
export {
  planRelativePath,
  writeMarkdownDocument,
  readMarkdownDocument,
  upsertDocument,
  DocumentRepositoryError,
} from "./documents/repository.ts";
export {
  DOCUMENT_KINDS,
  type Document,
  type DocumentKind,
  type IssueDocumentLink,
} from "./documents/types.ts";
export { generatePrompt } from "./prompts/generator.ts";
export { PROMPT_SECTIONS } from "./prompts/contracts.ts";
export { PROMPT_MODES, isPromptMode, type PromptMode, type PromptInput } from "./prompts/types.ts";
export {
  TRIAGE_ROLES,
  WORKFLOW_STATUSES,
  COMPLEXITY_VALUES,
  PLAN_STATUSES,
  QUEUE_MODES,
  type Issue,
  type TriageRole,
  type WorkflowStatus,
  type Complexity,
  type PlanStatus,
  type QueueMode,
  type ParsedIssueMarkdown,
} from "./issues/types.ts";
