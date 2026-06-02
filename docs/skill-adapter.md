# Flightdeck skill adapter

External skills and agents publish work into Flightdeck through the `deck` CLI. Flightdeck stores submitted PRDs and issue bodies as durable app data, then extracts structured fields for queues, blockers, PRD traceability, and prompts.

## PRD-backed workflows

Skills that generate requirements or issue slices should use Flightdeck's first-class PRD model:

- `to-prd` creates a PRD with `deck prd create`; it does not publish the PRD as an ordinary issue or parent issue.
- `to-issues` reads an existing PRD by public ID, or imports a markdown PRD file with `deck prd create` before slicing.
- Each generated vertical slice uses `deck issue create --prd <PRD_PUBLIC_ID>` and, when known, `--user-stories <NUMBERS>` to link the issue to the PRD and covered user stories.
- Dependencies are still issue blockers. Publish blocker slices first, capture the returned issue public IDs, then pass those IDs with `--blocked-by` when creating dependent slices.

Import a markdown PRD file:

```bash
deck prd create \
  --project OLA \
  --title "Checkout flow" \
  --body ./docs/prd/checkout-flow.md \
  --json
```

The JSON response includes `data.publicId` (for example `OLA-PRD-1`) and extracted `data.userStories`. Reuse that PRD ID for all slices created from the document.

Create a PRD-linked slice:

```bash
deck issue create \
  --project OLA \
  --title "Validate card details before submit" \
  --body ./issue.md \
  --prd OLA-PRD-1 \
  --user-stories 3,7 \
  --triage-role ready-for-agent \
  --complexity needs-plan \
  --json
```

The issue JSON response includes `data.linkedPrd.publicId`, `data.linkedPrd.userStoryNumbers`, `data.linkedPrd.userStories`, and `data.linkedPrd.missingUserStoryNumbers`.

## Relationship boundaries

`Parent`, `Blocked by`, PRDs, and Issue Plans are distinct relationships:

| Relationship                  | Stored as                                                  | Meaning                                                       |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `Parent`                      | Issue markdown metadata                                    | Issue hierarchy or source grouping. It is not the PRD link.   |
| `Blocked by` / `--blocked-by` | `issue_dependencies` rows                                  | Execution ordering between issues. It is not product context. |
| `--prd` / `--user-stories`    | `issue_prd_links` row                                      | Product context and user story traceability for a slice.      |
| Issue Plan                    | `documents` + `issue_document_links` with `link_kind=plan` | Implementation guidance for one issue after planning.         |

An issue can link to at most one same-project PRD. PRDs remain project records with statuses (`draft`, `active`, `archived`); they do not move through issue queues.

## Required issue body sections

Every Flightdeck-compatible issue body should use these markdown headings:

```md
## Parent

...

## What to build

...

## Acceptance criteria

- [ ] ...

## Blocked by

None - can start immediately
```

`Parent` may be `None` for root slices. `Blocked by` may list dependency public IDs (for example `OLA-9`), manual blocker text, or `None - can start immediately`.

Issue bodies may include human-readable PRD and user story sections if that helps file-first workflows, but automation should pass `--prd` and `--user-stories` so Flightdeck stores the link structurally. Command flags are the source of truth for generated slices.

## Create command pattern

Register the project once, then create issues with a file body or inline markdown:

```bash
deck project add --key OLA --name "Ola UI" --instructions "Run bun test before finishing."

deck issue create \
  --project OLA \
  --title "Add login validation" \
  --body ./issue.md \
  --triage-role ready-for-agent \
  --complexity needs-plan \
  --json
```

Inline body (escape or use a file for multiline content):

```bash
deck issue create \
  --project OLA \
  --title "Quick typo fix" \
  --body "## What to build\n\nFix label.\n\n## Acceptance criteria\n\n- [ ] Label reads correctly\n\n## Blocked by\n\nNone - can start immediately" \
  --triage-role ready-for-agent \
  --complexity simple \
  --json
```

### Flags skills should set

| Flag               | Purpose                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| `--project`        | Project key (uppercased by Flightdeck). Omit only when cwd is under a registered path. |
| `--title`          | Short issue title.                                                                     |
| `--body`           | Markdown string or path to a `.md` file with the sections above.                       |
| `--prd`            | Optional linked PRD public ID for PRD-backed slices.                                   |
| `--user-stories`   | Optional comma- or space-separated user story numbers; requires `--prd`.               |
| `--triage-role`    | Usually `ready-for-agent` for issues intended for agent pickup.                        |
| `--complexity`     | `simple` or `needs-plan`. Complex slices should use `needs-plan`.                      |
| `--blocked-by`     | Optional dependency public ID (for example `OLA-8`).                                   |
| `--manual-blocker` | Optional external blocker text when there is no dependency issue.                      |
| `--json`           | Machine-readable output with `publicId` (for example `OLA-12`).                        |

### Successful JSON response

```json
{
  "ok": true,
  "command": "issue create",
  "data": {
    "publicId": "OLA-12",
    "triageRole": "ready-for-agent",
    "workflowStatus": "backlog",
    "complexity": "needs-plan",
    "planStatus": "none",
    "unblocked": true,
    "linkedPrd": {
      "publicId": "OLA-PRD-1",
      "projectKey": "OLA",
      "title": "Checkout flow",
      "status": "active",
      "userStoryNumbers": [3, 7],
      "userStories": [
        {
          "number": 3,
          "text": "As a shopper, I want card errors before submit, so that I can correct them quickly."
        },
        {
          "number": 7,
          "text": "As a shopper, I want failed payment attempts explained, so that I know what to do next."
        }
      ],
      "missingUserStoryNumbers": []
    }
  }
}
```

Copy `data.publicId` into agent prompts, branch names, and dependency references.

## Batch publishing

When an external skill emits multiple slices, run one `deck issue create` per slice. Link dependencies with `--blocked-by` using public IDs returned from earlier creates in the same batch. Every slice from a PRD should also pass the same `--prd` value and its specific `--user-stories` coverage.

## Generated agent skill

Flightdeck can generate a small agent skill that teaches globally installed skills and agents to use `deck` as the issue tracker:

```bash
deck skill install --scope global
```

This writes `~/.agents/skills/flightdeck/SKILL.md` by default. Use project scope to write into a repository-local `.agents/skills` directory instead:

```bash
deck skill install --scope project --path /path/to/repository
```

The install command does not overwrite an existing `SKILL.md` unless `--force` is passed. Use `--path` with global scope to choose a different skills root.

To print concise text for global agent instructions:

```bash
deck skill instructions
```

## What skills should not do

- Do not write Flightdeck state into project repositories.
- Do not create git branches, commits, or pull requests through Flightdeck; current git flags only store metadata.
- Do not assume a web UI or cloud sync exists.

## Companion documentation

- [Agent workflows](./agent-workflows.md) — plan, implement, review, and address-review modes.
- [Schema reference](./schema.md) — tables and enums.
