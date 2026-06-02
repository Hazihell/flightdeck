# ADR 0001: First-class DB-backed PRDs

## Status

Accepted

## Context

Flightdeck coordinates agent work through projects, issues, issue plans, comments, blockers, queues, and generated prompts. External skills such as `to-prd` and `to-issues` need a durable way to publish product requirements and preserve traceability from generated vertical slices back to the requirements and user stories they implement.

Representing a PRD as an ordinary issue, a parent issue, blocker metadata, or an issue plan would collapse different domain concepts:

- PRDs describe product context and scope for a project.
- Parent metadata describes issue hierarchy or source grouping.
- Blockers describe execution ordering between issues.
- Issue Plans describe implementation guidance for one issue after planning.

Those relationships can all be useful for the same slice, but they answer different questions and should be stored separately.

## Decision

Flightdeck stores PRDs as first-class project-scoped database records in `prds`.

Each PRD has:

- A stable public ID allocated from a project PRD sequence, such as `OLA-PRD-1`.
- A project ID, title, status, markdown body, sequence number, and timestamps.
- A status of `draft`, `active`, or `archived`, with new PRDs defaulting to `active`.

Issues link to PRDs through `issue_prd_links`. Each issue may link to zero or one PRD, and the PRD must belong to the same project as the issue. The link stores `user_story_refs` as a JSON array of numbered user stories from the PRD.

The `to-prd` workflow maps to `deck prd create`. The `to-issues` workflow maps to PRD-backed `deck issue create` calls using `--prd <PRD_PUBLIC_ID>` and `--user-stories <NUMBERS>`. When `to-issues` starts from a markdown PRD file, it first imports the file with `deck prd create`, then uses the returned PRD public ID for generated slices.

## Non-Decisions

Flightdeck does not use `Parent` as the PRD relationship. `Parent` remains markdown metadata for issue hierarchy or source grouping.

Flightdeck does not use `Blocked by` as the PRD relationship. Dependency ordering remains stored in `issue_dependencies` and is published independently with `--blocked-by`.

Flightdeck does not use Issue Plans as PRDs. Issue Plans remain implementation guidance attached to one issue through `issue_document_links` with `link_kind=plan`.

Flightdeck does not treat PRDs as issues. PRDs do not have triage roles, workflow statuses, blockers, comments, or queue eligibility.

## Consequences

Agents can retrieve PRD context and user story traceability from structured JSON without reparsing issue markdown.

PRD-backed issue slicing keeps product context separate from dependency order. A generated slice can have a parent, be blocked by another slice, link to a PRD, and later receive an implementation plan without overloading one relationship to mean all four.

Same-project PRD links keep ownership clear. Cross-project requirements require explicit copying or a future cross-project relationship, not an accidental link.

User story references are stable as requested by the slice. If the PRD body changes later and a referenced story is missing, command output and prompts can surface the missing reference instead of silently rewriting the link.

The dedicated PRD model is intentionally narrower than a generic document model. If Flightdeck later gains more DB-backed artifact types, shared behavior can be extracted from real overlap rather than assumed now.
