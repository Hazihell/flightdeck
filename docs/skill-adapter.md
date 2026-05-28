# Flightdeck skill adapter

External skills and agents publish work into Flightdeck through the `deck` CLI. Flightdeck stores the submitted markdown body as canonical issue content and extracts structured fields for queues, blockers, and prompts.

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
    "unblocked": true
  }
}
```

Copy `data.publicId` into agent prompts, branch names, and dependency references.

## Batch publishing

When an external skill emits multiple slices, run one `deck issue create` per slice. Link dependencies with `--blocked-by` using public IDs returned from earlier creates in the same batch.

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
