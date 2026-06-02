# Flightdeck

Flightdeck is a **local-only** CLI issue tracker for coordinating agent work across multiple repositories. Workflow state lives in a private **Flightdeck home** directory, not in your project repos.

## Requirements

- [Bun](https://bun.sh) 1.1+

## Setup

```bash
git clone <repository-url> flightdeck
cd flightdeck
bun install
```

Link the CLI locally:

```bash
bun link
# or run without linking:
bun run src/cli.ts --help
```

Initialize your Flightdeck home (creates the database and document folders):

```bash
deck init
```

## Flightdeck home (`FLIGHTDECK_HOME`)

| Location                  | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| Default `~/Flightdeck`    | Database, config, markdown documents                    |
| `FLIGHTDECK_HOME` env var | Override home for tests, backup, or multiple workspaces |

Typical layout:

```text
~/Flightdeck/
  flightdeck.sqlite
  documents/
    issues/
      OLA-1/
        plan.md
```

Nothing under Flightdeck home is written into company or personal git repositories.

## Quick start

```bash
# 1. Register a project
deck project add --key OLA --name "Ola UI" \
  --instructions "Use Bun. Run bun test before finishing."

# 2. Register a checkout path (for cwd inference and prompts)
deck project path add --project OLA --path /path/to/ola-ui --label main

# 3. Create a Flightdeck-compatible issue from a markdown file
deck issue create --project OLA --title "Greeting banner" \
  --body ./issue.md --triage-role ready-for-agent --complexity needs-plan --json

# 4. Pick next planning work
deck issue next --mode plan --project OLA --json

# 5. Copy an agent prompt
deck issue prompt OLA-1 --mode plan
```

Create and inspect a project PRD:

```bash
deck prd create --project OLA --title "Checkout flow" --body ./prd.md --json
deck prd list --project OLA --json
deck prd show OLA-PRD-1
deck prd update OLA-PRD-1 --status archived --json
```

See [docs/skill-adapter.md](./docs/skill-adapter.md) for the required issue body sections and [docs/agent-workflows.md](./docs/agent-workflows.md) for plan/implement/review flows.

## Commands

| Command                   | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `deck init`               | Create database and home layout                                             |
| `deck project add`        | Register a project                                                          |
| `deck project path add`   | Register a filesystem path for a project                                    |
| `deck prd create`         | Create a project PRD from inline markdown or a file                         |
| `deck prd list`           | List draft and active PRDs, with optional status filtering                  |
| `deck prd show`           | Show one PRD with metadata and markdown body                                |
| `deck prd update`         | Update PRD title, markdown body, or status                                  |
| `deck issue create`       | Create an issue (Flightdeck-compatible body)                                |
| `deck issue list`         | List issues with optional filters                                           |
| `deck issue show`         | Show one issue with parsed markdown fields                                  |
| `deck issue next`         | Select next issue by mode (`plan`, `implement`, `review`, `address-review`) |
| `deck issue move`         | Update workflow status and optional git metadata                            |
| `deck issue comment`      | Add a markdown comment                                                      |
| `deck issue attach-plan`  | Attach implementation plan markdown                                         |
| `deck issue approve-plan` | Approve attached plan                                                       |
| `deck issue prompt`       | Generate mode-specific agent prompt                                         |
| `deck skill install`      | Install a Flightdeck skill for external agents                              |
| `deck skill instructions` | Print global instruction text for agents                                    |

Add `--json` for machine-readable output. Run `deck --help` for flag details.

## Agent skill setup

If you use globally installed agent skills, install the Flightdeck skill so agents know to use `deck` for issue tracking:

```bash
deck skill install --scope global
```

By default this writes `~/.agents/skills/flightdeck/SKILL.md`. For a project-local skill instead:

```bash
deck skill install --scope project --path /path/to/repository
```

Print global instruction text you can add to your agent instructions markdown:

```bash
deck skill instructions
```

## Development

```bash
bun test
bun run typecheck
bun run lint
bun run smoke    # end-to-end workflow test only
```

Tests use isolated temporary `FLIGHTDECK_HOME` directories.

## Documentation

- [Agent workflows](./docs/agent-workflows.md) — How humans and agents plan, implement, review, and address feedback
- [Skill adapter](./docs/skill-adapter.md) — Contract for skills that publish issues through `deck`
- [Schema](./docs/schema.md) — Data model, queue rules, relationships, and enums
- [ADR 0001](./docs/adr/0001-first-class-prds.md) — Why PRDs are first-class records, not parent issues, blockers, or issue plans
- [CONTEXT.md](./CONTEXT.md) — Domain language

## Roadmap

- Web UI for managing projects, issues, plans, and review queues
- Authentication, cloud sync, and multi-user collaboration
- Optional integrations with GitHub, Linear, Jira, Notion, and similar tools
- Automatic discovery of local repositories
- Background workers or plugin system
- Optional git automation for branch creation, commits, pushes, and PR creation

Today, Flightdeck does not write tracker state into project repositories. Git-related flags on `deck issue move` only **store metadata** for human and agent context.

## License

[MIT](LICENSE)
