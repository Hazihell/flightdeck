# Flightdeck schema reference

SQLite database at `$FLIGHTDECK_HOME/flightdeck.sqlite` (default `~/Flightdeck/flightdeck.sqlite`). Issue bodies and comments are stored as markdown text in SQLite. Attached long-form artifacts such as implementation plans are markdown files under the Flightdeck home, with metadata and issue links indexed in SQLite.

Current schema version: **5**.

## Core Concepts

PRDs are first-class, project-scoped records. They provide product context and user story traceability for issues, but they are not issues and do not move through issue queues.

Issue relationships have separate meanings:

- `Parent` in issue markdown is hierarchy or source grouping metadata.
- `issue_dependencies` represents `Blocked by` execution ordering between issues.
- `issue_prd_links` links one issue to one same-project PRD and optional numbered user stories.
- `issue_document_links` with `link_kind=plan` attaches an implementation plan to one issue.

## Tables

### `schema_migrations`

| Column       | Type       | Notes                     |
| ------------ | ---------- | ------------------------- |
| `version`    | INTEGER PK | Applied migration version |
| `applied_at` | TEXT       | ISO timestamp             |

### `projects`

| Column         | Type        | Notes                                      |
| -------------- | ----------- | ------------------------------------------ |
| `id`           | TEXT PK     | UUID                                       |
| `key`          | TEXT UNIQUE | Public key, uppercased (for example `OLA`) |
| `name`         | TEXT        | Display name                               |
| `kind`         | TEXT        | Default `app`                              |
| `instructions` | TEXT        | Optional agent instructions                |
| `created_at`   | TEXT        | ISO timestamp                              |
| `updated_at`   | TEXT        | ISO timestamp                              |

### `project_paths`

| Column       | Type                    | Notes                               |
| ------------ | ----------------------- | ----------------------------------- |
| `id`         | TEXT PK                 | UUID                                |
| `project_id` | TEXT FK → `projects.id` |                                     |
| `path`       | TEXT UNIQUE             | Normalized absolute filesystem path |
| `kind`       | TEXT                    | Default `checkout`                  |
| `label`      | TEXT                    | Optional label (for example `main`) |
| `created_at` | TEXT                    |                                     |
| `updated_at` | TEXT                    |                                     |

### `project_issue_sequences`

| Column          | Type                       | Notes                      |
| --------------- | -------------------------- | -------------------------- |
| `project_id`    | TEXT PK FK → `projects.id` |                            |
| `next_sequence` | INTEGER                    | Next issue sequence number |

### `project_prd_sequences`

| Column          | Type                       | Notes                    |
| --------------- | -------------------------- | ------------------------ |
| `project_id`    | TEXT PK FK → `projects.id` |                          |
| `next_sequence` | INTEGER                    | Next PRD sequence number |

### `issues`

| Column               | Type                    | Notes                                      |
| -------------------- | ----------------------- | ------------------------------------------ |
| `id`                 | TEXT PK                 | UUID                                       |
| `public_id`          | TEXT UNIQUE             | Project-prefixed ID (for example `OLA-12`) |
| `project_id`         | TEXT FK → `projects.id` |                                            |
| `sequence`           | INTEGER                 | Per-project sequence                       |
| `title`              | TEXT                    |                                            |
| `body_markdown`      | TEXT                    | Canonical Flightdeck-compatible markdown   |
| `triage_role`        | TEXT                    | See triage roles                           |
| `workflow_status`    | TEXT                    | See workflow statuses                      |
| `work_type`          | TEXT                    | Optional                                   |
| `complexity`         | TEXT                    | `simple` or `needs-plan`                   |
| `plan_status`        | TEXT                    | See plan statuses                          |
| `manual_blocker`     | TEXT                    | External blocker text                      |
| `branch`             | TEXT                    | Optional git metadata                      |
| `worktree_path`      | TEXT                    | Optional                                   |
| `pr_url`             | TEXT                    | Optional                                   |
| `validation_summary` | TEXT                    | Optional last validation note              |
| `commit_ref`         | TEXT                    | Optional                                   |
| `created_at`         | TEXT                    |                                            |
| `updated_at`         | TEXT                    |                                            |

Unique: `(project_id, sequence)`.

### `prds`

| Column          | Type                    | Notes                                              |
| --------------- | ----------------------- | -------------------------------------------------- |
| `id`            | TEXT PK                 | UUID                                               |
| `public_id`     | TEXT UNIQUE             | Project-prefixed PRD ID (for example `OLA-PRD-1`)  |
| `project_id`    | TEXT FK → `projects.id` |                                                    |
| `sequence`      | INTEGER                 | Per-project PRD sequence                           |
| `title`         | TEXT                    |                                                    |
| `status`        | TEXT                    | `draft`, `active`, or `archived`; default `active` |
| `body_markdown` | TEXT                    | PRD markdown body                                  |
| `created_at`    | TEXT                    |                                                    |
| `updated_at`    | TEXT                    |                                                    |

Unique: `(project_id, sequence)`.

PRD public IDs use the project key plus a PRD sequence, for example `OLA-PRD-1`. PRDs are stored in SQLite as application records, not as issue markdown or repository files. Normal listing returns draft and active PRDs by default; archived PRDs remain readable when requested explicitly.

### `issue_dependencies`

| Column             | Type                  | Notes           |
| ------------------ | --------------------- | --------------- |
| `id`               | TEXT PK               | UUID            |
| `issue_id`         | TEXT FK → `issues.id` | Dependent issue |
| `blocker_issue_id` | TEXT FK → `issues.id` | Blocker issue   |
| `created_at`       | TEXT                  |                 |

Unique: `(issue_id, blocker_issue_id)`.

`deck issue create` and `deck issue update --body` add structured dependencies when `## Blocked by` lists resolvable issue public IDs. `deck issue update --body` does not remove existing dependencies when that section changes — use `deck issue unblock-by` to drop a structured blocker.

### `issue_prd_links`

| Column            | Type                  | Notes                                       |
| ----------------- | --------------------- | ------------------------------------------- |
| `id`              | TEXT PK               | UUID                                        |
| `issue_id`        | TEXT FK → `issues.id` | Linked issue                                |
| `prd_id`          | TEXT FK → `prds.id`   | Linked same-project PRD                     |
| `user_story_refs` | TEXT                  | JSON array of numeric user story references |
| `created_at`      | TEXT                  |                                             |
| `updated_at`      | TEXT                  |                                             |

Unique: `(issue_id)` — an issue can link to at most one PRD. Parent issues, blockers, and issue plan documents remain separate relationships.

`user_story_refs` stores the requested numbered user story references as JSON, for example `[3,7]`. Flightdeck preserves the requested numbers even when a later PRD edit removes or renumbers a story; command output surfaces missing references instead of rewriting the link.

### `issue_comments`

| Column          | Type                  | Notes        |
| --------------- | --------------------- | ------------ |
| `id`            | TEXT PK               | UUID         |
| `issue_id`      | TEXT FK → `issues.id` |              |
| `body_markdown` | TEXT                  | Comment body |
| `created_at`    | TEXT                  |              |
| `updated_at`    | TEXT                  |              |

### `documents`

| Column          | Type        | Notes                      |
| --------------- | ----------- | -------------------------- |
| `id`            | TEXT PK     | UUID                       |
| `kind`          | TEXT        | `plan`                     |
| `relative_path` | TEXT UNIQUE | Path under Flightdeck home |
| `created_at`    | TEXT        |                            |
| `updated_at`    | TEXT        |                            |

### `issue_document_links`

| Column        | Type                     | Notes  |
| ------------- | ------------------------ | ------ |
| `id`          | TEXT PK                  | UUID   |
| `issue_id`    | TEXT FK → `issues.id`    |        |
| `document_id` | TEXT FK → `documents.id` |        |
| `link_kind`   | TEXT                     | `plan` |
| `created_at`  | TEXT                     |        |

Unique: `(issue_id, link_kind)` — one plan document per issue.

## Relationships

```text
projects 1──* project_paths
projects 1──* issues
projects 1──* prds
projects 1──1 project_issue_sequences
projects 1──1 project_prd_sequences
issues *──* issues  (via issue_dependencies: dependent → blocker)
issues 1──0..1 prds  (via issue_prd_links)
issues 1──* issue_comments
issues 1──0..1 documents  (via issue_document_links, link_kind=plan)
```

## JSON Output

Commands that emit PRD or issue data include structured PRD fields so agents do not need to reparse markdown for traceability.

`deck prd show <PUBLIC_ID> --json` and PRD entries in `deck prd list --json` include:

```json
{
  "kind": "prd",
  "publicId": "OLA-PRD-1",
  "projectKey": "OLA",
  "title": "Checkout flow",
  "status": "active",
  "bodyMarkdown": "# PRD\n\n...",
  "userStories": [
    {
      "number": 3,
      "text": "As a shopper, I want card errors before submit, so that I can correct them quickly."
    }
  ]
}
```

`userStories` is extracted from numbered items under the PRD's `User Stories` section when present. Missing or malformed sections produce an empty array; the PRD body remains canonical.

`deck issue create --json`, `deck issue show --json`, `deck issue link-prd --json`, `deck issue unlink-prd --json`, queue results, and issue lists include `linkedPrd`:

```json
{
  "kind": "issue",
  "publicId": "OLA-12",
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
      { "number": 7, "text": null }
    ],
    "missingUserStoryNumbers": [7]
  }
}
```

`linkedPrd` is `null` when the issue is not PRD-backed. `userStoryNumbers` is the stored reference list. `userStories[].text` is `null` for requested stories that are not currently found in the PRD body, and those numbers also appear in `missingUserStoryNumbers`.

## Enums

### PRD statuses (`prds.status`)

| Value      | Meaning                          |
| ---------- | -------------------------------- |
| `draft`    | Draft PRD, not yet active        |
| `active`   | Default; current source of truth |
| `archived` | Historical PRD                   |

### Triage roles (`issues.triage_role`)

| Value             | Meaning                     |
| ----------------- | --------------------------- |
| `needs-triage`    | Default; not yet triaged    |
| `needs-info`      | Blocked on more information |
| `ready-for-agent` | Suitable for agent queues   |
| `ready-for-human` | Suitable for human pickup   |
| `wontfix`         | Will not be actioned        |

### Workflow statuses (`issues.workflow_status`)

| Value               | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `backlog`           | Not started                                           |
| `in-progress`       | Implementation underway                               |
| `needs-review`      | Ready for review                                      |
| `changes-requested` | Review feedback to address                            |
| `accepted`          | Human accepted; dependents still blocked until `done` |
| `done`              | Complete; unblocks dependents                         |

### Complexity (`issues.complexity`)

| Value        | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `simple`     | May implement without a plan                               |
| `needs-plan` | Requires attached and approved plan before implement queue |

### Plan status (`issues.plan_status`)

| Value               | Meaning                                 |
| ------------------- | --------------------------------------- |
| `none`              | No plan                                 |
| `attached`          | Plan markdown stored; awaiting approval |
| `changes-requested` | Plan needs revision                     |
| `approved`          | Plan approved; implement queue eligible |

### Queue modes (CLI `--mode`, not stored)

| Mode             | Selection summary                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `plan`           | `ready-for-agent`, `backlog`, `needs-plan`, plan status `none` or `changes-requested`, unblocked |
| `implement`      | `ready-for-agent`, `backlog`, unblocked, `simple` or approved plan                               |
| `review`         | `needs-review`                                                                                   |
| `address-review` | `changes-requested`, unblocked                                                                   |

### Document kinds (`documents.kind`)

| Value  | Meaning                            |
| ------ | ---------------------------------- |
| `plan` | Issue implementation plan markdown |

Issue plans are stored at `documents/issues/<PUBLIC_ID>/plan.md` under the Flightdeck home.
