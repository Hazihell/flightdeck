#!/usr/bin/env bun
import { homedir } from "node:os";

import { flagString, hasFlag, parseArgs } from "./cli-args.ts";
import { closeDatabase, openDatabase } from "./db/client.ts";
import { resolveFlightdeckHome } from "./home.ts";
import { initFlightdeck } from "./init.ts";
import {
  runIssueApprovePlan,
  runIssueAttachPlan,
  runIssueBlockBy,
  runIssueComment,
  runIssueCreate,
  runIssueList,
  runIssueMove,
  runIssueNext,
  runIssuePrompt,
  runIssueRequestPlanChanges,
  runIssueShow,
  runIssueUnblockBy,
  runIssueUpdate,
} from "./issues/commands.ts";
import { runPrdCreate, runPrdList, runPrdShow, runPrdUpdate } from "./prds/commands.ts";
import { runProjectAdd, runProjectPathAdd } from "./projects/commands.ts";
import { runSkillInstall, runSkillInstructions } from "./skills/commands.ts";

export const HELP_TEXT = `Flightdeck CLI

Usage:
  deck init
  deck project add --key <KEY> --name <NAME> [--kind <KIND>] [--instructions <TEXT>]
  deck project path add --project <KEY> --path <PATH> [--kind <KIND>] [--label <LABEL>]
  deck prd create --project <KEY> --title <TITLE> --body <MARKDOWN_OR_PATH> [--status draft|active|archived]
  deck prd list [--project <KEY>] [--status draft|active|archived]
  deck prd show <PUBLIC_ID>
  deck prd update <PUBLIC_ID> [--title <TITLE>] [--body <MARKDOWN_OR_PATH>] [--status draft|active|archived]
  deck issue create --project <KEY> --title <TITLE> --body <MARKDOWN_OR_PATH> [--triage-role <ROLE>] [--workflow-status <STATUS>] [--complexity simple|needs-plan] [--blocked-by <PUBLIC_ID>] [--manual-blocker <TEXT>] [--prd <PRD_PUBLIC_ID>] [--user-stories <NUMBERS>]
  deck issue list [--project <KEY>] [--status <STATUS>] [--triage-role <ROLE>]
  deck issue show <PUBLIC_ID>
  deck issue update <PUBLIC_ID> [--title <TITLE>] [--body <MARKDOWN_OR_PATH>] [--triage-role <ROLE>] [--complexity simple|needs-plan] [--manual-blocker <TEXT>] [--clear-manual-blocker]
    (--body adds structured dependencies from ## Blocked by; use unblock-by to remove them)
  deck issue block-by <PUBLIC_ID> --issue <BLOCKER_PUBLIC_ID>
  deck issue unblock-by <PUBLIC_ID> --issue <BLOCKER_PUBLIC_ID>
  deck issue next --mode plan|implement|review|address-review [--project <KEY>]
  deck issue move <PUBLIC_ID> --status <STATUS> [--validation <TEXT>] [--branch <BRANCH>] [--worktree-path <PATH>] [--commit <REF>] [--pr-url <URL>]
  deck issue comment <PUBLIC_ID> --body <TEXT_OR_PATH>
  deck issue attach-plan <PUBLIC_ID> --body <TEXT_OR_PATH>
  deck issue approve-plan <PUBLIC_ID>
  deck issue request-plan-changes <PUBLIC_ID> [--validation <TEXT>]
  deck issue prompt <PUBLIC_ID> --mode plan|implement|review|address-review [--path <PATH>] [--json]
  deck skill install [--scope global|project] [--path <DIR>] [--name <NAME>] [--force] [--json]
  deck skill instructions [--json]

Global flags:
  --help    Show this help
  --json    Emit JSON output (default for machine-readable commands)
`;

type CliOutput =
  | {
      ok: true;
      command?: string;
      data?: Record<string, unknown>;
    }
  | {
      ok: false;
      command?: string;
      error: { code: string; message: string };
    };

function printHumanData(data: Record<string, unknown>): void {
  if (Array.isArray(data.prds)) {
    const prds = data.prds as Array<Record<string, unknown>>;
    const count = typeof data.count === "number" ? data.count : prds.length;
    console.log(`count: ${count}`);
    for (const prd of prds) {
      console.log(`${String(prd.publicId)}  ${String(prd.title)}  [${String(prd.status)}]`);
    }
    return;
  }

  if (Array.isArray(data.issues)) {
    const issues = data.issues as Array<Record<string, unknown>>;
    const count = typeof data.count === "number" ? data.count : issues.length;
    console.log(`count: ${count}`);
    for (const issue of issues) {
      console.log(
        `${String(issue.publicId)}  ${String(issue.title)}  [${String(issue.workflowStatus)}]`,
      );
    }
    return;
  }

  if (data.issue === null) {
    console.log("issue: (none)");
    if (typeof data.mode === "string") {
      console.log(`mode: ${data.mode}`);
    }
    return;
  }

  if (typeof data.prompt === "string") {
    console.log(String(data.prompt));
    return;
  }

  if (typeof data.text === "string") {
    console.log(data.text);
    return;
  }

  // Output payloads are discriminated by `kind` (e.g. "issue", "prd").
  // Any new body-bearing output must set `kind` or it falls through to the
  // generic key/value dump at the end of this function.
  if (data.kind === "prd") {
    console.log(`publicId: ${String(data.publicId)}`);
    console.log(`title: ${String(data.title)}`);
    console.log(
      `status: ${typeof data.status === "string" ? data.status : JSON.stringify(data.status)}`,
    );
    console.log(`projectKey: ${String(data.projectKey)}`);
    console.log("");
    if (typeof data.bodyMarkdown === "string") {
      console.log(data.bodyMarkdown);
    }
    return;
  }

  if (data.kind === "issue" && data.bodyMarkdown !== undefined) {
    console.log(`publicId: ${String(data.publicId)}`);
    console.log(`title: ${String(data.title)}`);
    console.log(`triageRole: ${String(data.triageRole)}`);
    console.log(`workflowStatus: ${String(data.workflowStatus)}`);
    console.log(`complexity: ${String(data.complexity)}`);
    console.log(`planStatus: ${String(data.planStatus)}`);
    console.log(`unblocked: ${String(data.unblocked)}`);
    if (typeof data.manualBlocker === "string") {
      console.log(`manualBlocker: ${data.manualBlocker}`);
    }
    const blockers = data.dependencyBlockers as Array<Record<string, unknown>> | undefined;
    if (blockers && blockers.length > 0) {
      console.log("dependencyBlockers:");
      for (const blocker of blockers) {
        console.log(`  ${String(blocker.publicId)} (${String(blocker.workflowStatus)})`);
      }
    }
    console.log("");
    if (typeof data.bodyMarkdown === "string") {
      console.log(data.bodyMarkdown);
    }
    return;
  }

  for (const [key, value] of Object.entries(data)) {
    console.log(`${key}: ${String(value)}`);
  }
}

function printWarnings(data: Record<string, unknown> | undefined): void {
  const warnings = data?.warnings as Array<Record<string, unknown>> | undefined;
  if (!warnings || warnings.length === 0) {
    return;
  }
  for (const warning of warnings) {
    console.error(`warning: ${String(warning.message)}`);
  }
}

function shouldEmitJson(flags: Map<string, string | boolean>): boolean {
  return hasFlag(flags, "json") || !process.stdout.isTTY;
}

function printOutput(output: CliOutput, flags: Map<string, string | boolean>): void {
  if (output.ok) {
    printWarnings(output.data);
  }

  if (shouldEmitJson(flags)) {
    console.log(JSON.stringify(output));
    return;
  }

  if (output.ok) {
    if (output.data) {
      printHumanData(output.data);
    }
    return;
  }

  console.error(output.error.message);
}

export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  platformHome: string = homedir(),
): Promise<number> {
  const parsed = parseArgs(argv);
  const flags = parsed.flags;

  if (hasFlag(flags, "help")) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (parsed.command.length === 0) {
    console.log(HELP_TEXT);
    return 1;
  }

  const [root, sub, leaf] = parsed.command;

  try {
    if (root === "init" && parsed.command.length === 1) {
      const result = await initFlightdeck(env, platformHome);
      const output: CliOutput = {
        ok: true,
        command: "init",
        data: {
          home: result.home,
          databasePath: result.databasePath,
          schemaVersion: result.schemaVersion,
        },
      };
      printOutput(output, flags);
      return 0;
    }

    if (root === "project" && sub === "add" && parsed.command.length === 2) {
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runProjectAdd(db, {
          key: flagString(flags, "key") ?? "",
          name: flagString(flags, "name") ?? "",
          kind: flagString(flags, "kind"),
          instructions: flagString(flags, "instructions"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "project add", data: result.data }
          : { ok: false, command: "project add", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "project" && sub === "path" && leaf === "add" && parsed.command.length === 3) {
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runProjectPathAdd(db, {
          projectKey: flagString(flags, "project") ?? "",
          path: flagString(flags, "path") ?? "",
          kind: flagString(flags, "kind"),
          label: flagString(flags, "label"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "project path add", data: result.data }
          : { ok: false, command: "project path add", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "prd" && sub === "create" && parsed.command.length === 2) {
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runPrdCreate(db, {
          projectKey: flagString(flags, "project"),
          cwd: process.cwd(),
          title: flagString(flags, "title") ?? "",
          body: flagString(flags, "body"),
          status: flagString(flags, "status"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "prd create", data: result.data }
          : { ok: false, command: "prd create", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "prd" && sub === "list" && parsed.command.length === 2) {
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runPrdList(db, {
          projectKey: flagString(flags, "project"),
          cwd: process.cwd(),
          status: flagString(flags, "status"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "prd list", data: result.data }
          : { ok: false, command: "prd list", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "prd" && sub === "show" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runPrdShow(db, publicId);
        const output: CliOutput = result.ok
          ? { ok: true, command: "prd show", data: result.data }
          : { ok: false, command: "prd show", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "prd" && sub === "update" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runPrdUpdate(db, {
          publicId,
          title: flagString(flags, "title"),
          body: flagString(flags, "body"),
          status: flagString(flags, "status"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "prd update", data: result.data }
          : { ok: false, command: "prd update", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "create" && parsed.command.length === 2) {
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueCreate(db, {
          projectKey: flagString(flags, "project"),
          cwd: process.cwd(),
          title: flagString(flags, "title") ?? "",
          body: flagString(flags, "body"),
          triageRole: flagString(flags, "triage-role"),
          workflowStatus: flagString(flags, "status") ?? flagString(flags, "workflow-status"),
          complexity: flagString(flags, "complexity"),
          blockedBy: flagString(flags, "blocked-by"),
          manualBlocker: flagString(flags, "manual-blocker"),
          prd: flagString(flags, "prd"),
          userStories: flagString(flags, "user-stories") ?? flagString(flags, "user-story"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue create", data: result.data }
          : { ok: false, command: "issue create", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "list" && parsed.command.length === 2) {
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueList(db, {
          projectKey: flagString(flags, "project"),
          workflowStatus: flagString(flags, "status"),
          triageRole: flagString(flags, "triage-role"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue list", data: result.data }
          : { ok: false, command: "issue list", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "show" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueShow(db, publicId);
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue show", data: result.data }
          : { ok: false, command: "issue show", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "update" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueUpdate(db, {
          publicId,
          title: flagString(flags, "title"),
          body: flagString(flags, "body"),
          triageRole: flagString(flags, "triage-role"),
          complexity: flagString(flags, "complexity"),
          manualBlocker: flagString(flags, "manual-blocker"),
          clearManualBlocker: hasFlag(flags, "clear-manual-blocker"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue update", data: result.data }
          : { ok: false, command: "issue update", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "block-by" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueBlockBy(db, {
          publicId,
          blockerPublicId: flagString(flags, "issue") ?? "",
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue block-by", data: result.data }
          : { ok: false, command: "issue block-by", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "unblock-by" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueUnblockBy(db, {
          publicId,
          blockerPublicId: flagString(flags, "issue") ?? "",
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue unblock-by", data: result.data }
          : { ok: false, command: "issue unblock-by", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "next" && parsed.command.length === 2) {
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueNext(db, {
          mode: flagString(flags, "mode") ?? "",
          projectKey: flagString(flags, "project"),
          cwd: process.cwd(),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue next", data: result.data }
          : { ok: false, command: "issue next", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "move" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueMove(db, {
          publicId,
          status: flagString(flags, "status") ?? "",
          validation: flagString(flags, "validation"),
          branch: flagString(flags, "branch"),
          worktreePath: flagString(flags, "worktree-path"),
          commit: flagString(flags, "commit"),
          prUrl: flagString(flags, "pr-url"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue move", data: result.data }
          : { ok: false, command: "issue move", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "comment" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueComment(db, {
          publicId,
          body: flagString(flags, "body"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue comment", data: result.data }
          : { ok: false, command: "issue comment", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "attach-plan" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const home = resolveFlightdeckHome(env, platformHome);
      const db = openDatabase(home);
      try {
        const result = await runIssueAttachPlan(db, home, {
          publicId,
          body: flagString(flags, "body"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue attach-plan", data: result.data }
          : { ok: false, command: "issue attach-plan", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "approve-plan" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueApprovePlan(db, publicId);
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue approve-plan", data: result.data }
          : { ok: false, command: "issue approve-plan", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "request-plan-changes" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const db = openDatabase(resolveFlightdeckHome(env, platformHome));
      try {
        const result = runIssueRequestPlanChanges(db, {
          publicId,
          validation: flagString(flags, "validation"),
        });
        const output: CliOutput = result.ok
          ? {
              ok: true,
              command: "issue request-plan-changes",
              data: result.data,
            }
          : {
              ok: false,
              command: "issue request-plan-changes",
              error: result.error,
            };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "issue" && sub === "prompt" && parsed.command.length >= 2) {
      const publicId =
        parsed.command.length >= 3 ? (parsed.command[2] ?? "") : (parsed.positional[0] ?? "");
      const home = resolveFlightdeckHome(env, platformHome);
      const db = openDatabase(home);
      try {
        const result = await runIssuePrompt(db, home, {
          publicId,
          mode: flagString(flags, "mode") ?? "",
          repositoryPath: flagString(flags, "path"),
        });
        const output: CliOutput = result.ok
          ? { ok: true, command: "issue prompt", data: result.data }
          : { ok: false, command: "issue prompt", error: result.error };
        printOutput(output, flags);
        return result.ok ? 0 : 1;
      } finally {
        closeDatabase(db);
      }
    }

    if (root === "skill" && sub === "install" && parsed.command.length === 2) {
      const result = await runSkillInstall({
        scope: flagString(flags, "scope") ?? (hasFlag(flags, "project") ? "project" : undefined),
        path: flagString(flags, "path"),
        name: flagString(flags, "name"),
        force: hasFlag(flags, "force"),
        platformHome,
        cwd: process.cwd(),
      });
      const output: CliOutput = result.ok
        ? { ok: true, command: "skill install", data: result.data }
        : { ok: false, command: "skill install", error: result.error };
      printOutput(output, flags);
      return result.ok ? 0 : 1;
    }

    if (root === "skill" && sub === "instructions" && parsed.command.length === 2) {
      const result = runSkillInstructions();
      const output: CliOutput = result.ok
        ? { ok: true, command: "skill instructions", data: result.data }
        : { ok: false, command: "skill instructions", error: result.error };
      printOutput(output, flags);
      return result.ok ? 0 : 1;
    }

    const output: CliOutput = {
      ok: false,
      error: {
        code: "unknown_command",
        message: `Unknown command: ${parsed.command.join(" ")}`,
      },
    };
    printOutput(output, flags);
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output: CliOutput = {
      ok: false,
      error: { code: "internal_error", message },
    };
    printOutput(output, flags);
    return 1;
  }
}

if (import.meta.main) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}
