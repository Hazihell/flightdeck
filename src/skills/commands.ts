import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string } };

export type SkillScope = "global" | "project";

const DEFAULT_SKILL_NAME = "flightdeck";

export const FLIGHTDECK_SKILL_MARKDOWN = `---
name: flightdeck
description: Use Flightdeck (deck) for issue-tracker work in registered repos, including PRDs, issue slicing, planning, implementation, review fixes, comments, and state updates.
---

# Flightdeck

Flightdeck is the issue tracker. If another skill says "publish to the issue tracker" or names GitHub/Gitea/Jira/Linear/Obsidian/etc., translate that workflow to \`deck\`. Do not store issue state in repo files or external trackers unless the user explicitly overrides.

## Publish work

Use for PRDs, parent specs, and vertical slices from skills like \`to-prd\` and \`to-issues\`. Run from a registered repo, or pass \`--project <KEY>\`. Use \`--json\` when consuming output.

Body shape:

\`\`\`md
## Parent
None or <PUBLIC_ID>
## What to build
...
## Acceptance criteria
- [ ] ...
## Blocked by
None - can start immediately
\`\`\`

- PRD/spec: create one parent issue; put the concise PRD in \`What to build\`; use \`--complexity needs-plan\` for non-simple implementation.
- Slices: create one issue per approved vertical slice, blockers first; pass \`--blocked-by <PUBLIC_ID>\` for dependencies; usually set \`--triage-role ready-for-agent\`.

\`\`\`bash
deck issue create --project <KEY> --title "<TITLE>" --body <MD_OR_PATH> --triage-role ready-for-agent --complexity simple|needs-plan --json
\`\`\`

## Work an issue

\`\`\`bash
deck issue next --mode plan|implement|review|address-review --project <KEY> --json
deck issue prompt <PUBLIC_ID> --mode plan|implement|review|address-review
\`\`\`

- Plan: attach with \`deck issue attach-plan <ID> --body <MD_OR_PATH>\`; approve with \`deck issue approve-plan <ID>\`; never implement \`needs-plan\` before approval.
- Implement: move to \`in-progress\`; finish at \`needs-review\` with \`--validation "<tests>"\` and optional \`--branch\`, \`--commit\`, \`--pr-url\`.
- Review: move to \`accepted\`, \`changes-requested\`, or \`done\` with validation; only \`done\` unblocks dependents.
- Address review: fix feedback, then move back to \`needs-review\`.

## Update state

\`\`\`bash
deck issue show <PUBLIC_ID> --json
deck issue comment <PUBLIC_ID> --body "<MD>"
deck issue move <PUBLIC_ID> --status in-progress|needs-review|changes-requested|accepted|done --validation "<SUMMARY>"
\`\`\`
`;

export const FLIGHTDECK_GLOBAL_INSTRUCTIONS = `## Flightdeck issue tracking

In Flightdeck-registered repos, all issue work must use Flightdeck.

- For creating, planning, selecting, implementing, reviewing, addressing feedback, or updating issues, invoke the \`flightdeck\` skill and follow it for exact \`deck\` commands.
- If another skill names another issue tracker, map that workflow to Flightdeck instead unless the user explicitly overrides this.
- Do not write issue state to the repo or external trackers.
- Require an approved Flightdeck plan before non-simple implementation.
`;

export async function runSkillInstall(input: {
  scope?: string;
  path?: string;
  name?: string;
  force?: boolean;
  platformHome: string;
  cwd: string;
}): Promise<CommandResult> {
  const scope = input.scope ?? "global";
  if (scope !== "global" && scope !== "project") {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "Invalid --scope. Expected global or project.",
      },
    };
  }

  const name = input.name ?? DEFAULT_SKILL_NAME;
  if (!isValidSkillName(name)) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: "Invalid --name. Use lowercase letters, numbers, underscores, or hyphens.",
      },
    };
  }

  const skillPath = skillFilePath({
    scope,
    rootPath: input.path,
    name,
    platformHome: input.platformHome,
    cwd: input.cwd,
  });

  if (!input.force && (await fileExists(skillPath))) {
    return {
      ok: false,
      error: {
        code: "skill_exists",
        message: `Skill already exists at ${skillPath}. Use --force to overwrite.`,
      },
    };
  }

  await mkdir(dirname(skillPath), { recursive: true });
  await writeFile(skillPath, skillMarkdownForName(name), "utf8");

  return {
    ok: true,
    data: {
      scope,
      name,
      path: skillPath,
    },
  };
}

export function runSkillInstructions(): CommandResult {
  return {
    ok: true,
    data: {
      text: FLIGHTDECK_GLOBAL_INSTRUCTIONS,
    },
  };
}

function skillFilePath(input: {
  scope: SkillScope;
  rootPath?: string;
  name: string;
  platformHome: string;
  cwd: string;
}): string {
  if (input.scope === "global") {
    const skillsRoot = input.rootPath ?? join(input.platformHome, ".agents", "skills");
    return join(resolve(skillsRoot), input.name, "SKILL.md");
  }

  const projectRoot = input.rootPath ?? input.cwd;
  return join(resolve(projectRoot), ".agents", "skills", input.name, "SKILL.md");
}

function skillMarkdownForName(name: string): string {
  if (name === DEFAULT_SKILL_NAME) {
    return FLIGHTDECK_SKILL_MARKDOWN;
  }

  return FLIGHTDECK_SKILL_MARKDOWN.replace("name: flightdeck", `name: ${name}`);
}

function isValidSkillName(name: string): boolean {
  return /^[a-z0-9_-]+$/.test(name);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
