# PRD: First-class PRD support for Flightdeck

## Problem Statement

Flightdeck currently supports issues, issue plans, comments, blockers, queues, and generated agent prompts, but it does not have first-class support for product requirements documents. External skills such as `to-prd` and `to-issues` need a durable place to save PRDs and a reliable way to link vertical-slice issues back to the PRD and user stories they implement.

Today, a PRD-like artifact can only be represented indirectly as issue markdown or loose parent metadata. That makes PRD context hard for agents to find, makes issue slicing lossy, and risks confusing PRDs with parent issues, blockers, or issue plans. Agents working on planning, implementation, review, or address-review prompts need easy access to the linked PRD so they can preserve product intent across the full issue lifecycle.

## Solution

Add first-class, project-scoped PRDs to Flightdeck. A PRD is saved in Flightdeck with a project-scoped public ID, title, status, markdown body, timestamps, and linked issues. Issues may link to at most one PRD from the same project, and may reference one or more numbered user stories inside that PRD.

The `to-prd` workflow should create a Flightdeck PRD instead of publishing the PRD as an ordinary issue. The `to-issues` workflow should read from an existing Flightdeck PRD or from a markdown file. When given a markdown file, `to-issues` should first save it as a Flightdeck PRD, then create linked vertical-slice issues with PRD and user story references.

Generated issue prompts should include linked PRD context in all modes: planning, implementation, review, and address-review. The prompt should show PRD metadata, the user stories covered by the issue, and the full PRD markdown so agents can easily read the product context.

## User Stories

1. As a user, I want to save a PRD in Flightdeck, so that product requirements are durable app data instead of transient chat context.
2. As a user, I want each PRD to have a project-scoped public ID, so that humans and agents can reference it reliably.
3. As a user, I want PRDs to belong to a project, so that requirements are scoped to the correct work context.
4. As a user, I want to create a PRD from inline markdown, so that agents can publish generated PRDs directly.
5. As a user, I want to create a PRD from a markdown file, so that existing PRD files can be brought into Flightdeck.
6. As a user, I want to show a PRD by public ID, so that I can inspect its metadata and content.
7. As a user, I want to list PRDs by project, so that I can discover the requirements documents for a project.
8. As a user, I want to filter PRDs by status, so that active PRDs are easy to distinguish from draft or archived ones.
9. As a user, I want to update a PRD title, body, or status, so that generated PRDs can be corrected without creating duplicates.
10. As a user, I want PRDs to have draft, active, and archived statuses, so that I can distinguish early drafts, canonical working documents, and historical documents.
11. As a user, I want new PRDs to default to active, so that `to-prd` output is immediately usable by `to-issues`.
12. As a user, I want archived PRDs to remain readable, so that historical issue context is not lost.
13. As a user, I want normal PRD listing to avoid archived PRDs by default, so that stale requirements do not clutter selection.
14. As a user, I want an issue to link to a PRD, so that the issue has durable product context.
15. As a user, I want an issue to reference specific user stories in the linked PRD, so that the slice’s scope is clear.
16. As a user, I want an issue to link to at most one PRD, so that agent prompts have one clear source of product context.
17. As a user, I want PRD links to be same-project only, so that cross-project ownership remains unambiguous.
18. As a user, I want to link a PRD when creating an issue, so that `to-issues` can publish linked slices in one flow.
19. As a user, I want to link a PRD to an existing issue, so that I can backfill or correct issue context.
20. As a user, I want to unlink a PRD from an issue, so that mistaken links can be corrected.
21. As a user, I want issue markdown to optionally include PRD and user story sections, so that file-first workflows remain readable.
22. As a user, I want command flags to override PRD markdown sections, so that automation has an unambiguous source of truth.
23. As a user, I want Flightdeck to store PRD links structurally, so that prompts and JSON output do not depend on reparsing issue markdown.
24. As a user, I want issue body markdown preserved as submitted, so that Flightdeck does not silently rewrite agent-created issue content.
25. As a user, I want `Parent` to remain separate from PRD links, so that issue hierarchy is not confused with product requirements.
26. As a user, I want `Blocked by` to remain separate from PRD links, so that dependencies are not confused with product requirements.
27. As a user, I want issue plans to remain separate from PRDs, so that implementation guidance is not confused with product context.
28. As an agent using `to-prd`, I want to create a PRD through Flightdeck, so that the PRD is saved in the app before issue slicing begins.
29. As an agent using `to-issues`, I want to read an existing Flightdeck PRD, so that I can create vertical slices from canonical app data.
30. As an agent using `to-issues`, I want to save a markdown PRD file into Flightdeck before slicing, so that file-based PRDs become app data.
31. As an agent using `to-issues`, I want to create issues linked to a PRD and user stories, so that each slice preserves traceability back to the source requirements.
32. As an agent using `to-issues`, I want to publish blockers in dependency order while also linking each issue to the PRD, so that execution order and product context are both preserved.
33. As a planning agent, I want a plan prompt to include linked PRD context, so that the issue plan reflects the product intent.
34. As an implementation agent, I want an implementation prompt to include linked PRD context, so that I implement the slice without losing broader requirements.
35. As a review agent, I want a review prompt to include linked PRD context, so that I can detect scope drift and missed user intent.
36. As an address-review agent, I want the linked PRD context, so that fixes preserve original product intent while addressing feedback.
37. As an agent, I want covered user stories highlighted before the full PRD, so that I know which parts of the PRD are most relevant.
38. As an agent, I want the full PRD available in the prompt, so that I do not need another command to understand the surrounding context.
39. As an agent, I want missing user story references to produce warnings rather than hard failures, so that imperfect markdown extraction does not block work.
40. As a user, I want warnings for archived PRDs when linking new issues, so that accidental use of stale requirements is visible.
41. As a user, I want PRD JSON output to include extracted user stories, so that agents can reason about coverage.
42. As a user, I want PRD JSON output to include linked issues, so that I can inspect which slices cover the PRD.
43. As a user, I want issue JSON output to include linked PRD metadata and user story references, so that downstream tools can read traceability.
44. As a maintainer, I want PRD storage to be database-backed, so that PRDs are first-class app records instead of file attachments.
45. As a maintainer, I want PRDs and issue plans to stay separate concepts, so that future storage migrations do not collapse product requirements into implementation plans.
46. As a maintainer, I want focused PRD modules that can be tested in isolation, so that parsing, linking, and prompt generation stay reliable.
47. As a maintainer, I want external skill documentation updated, so that global skills map `to-prd` and `to-issues` workflows to Flightdeck correctly.
48. As a maintainer, I want generated Flightdeck skill instructions updated, so that agents learn the PRD workflow without long duplicated instructions.
49. As a maintainer, I want schema documentation updated, so that future contributors understand PRD records and issue links.
50. As a maintainer, I want an ADR for first-class PRDs, so that future readers understand why PRDs are not parent issues, blockers, or issue plans.

## Implementation Decisions

- Add DB-backed PRDs as first-class project-scoped records with public IDs, sequence numbers, title, status, markdown body, and timestamps.
- Add per-project PRD sequencing so public IDs are stable and human-readable, such as a project key followed by a PRD sequence.
- Add structured issue-to-PRD links. Each issue can link to zero or one PRD, and the linked PRD must belong to the same project as the issue.
- Store user story references on the issue-to-PRD link as structured numeric references into the PRD’s numbered user stories.
- Keep PRD markdown in the database. PRDs are app records, not file-backed attachments.
- Keep Issue Plans conceptually separate from PRDs. Issue Plans are created by planning agents for one issue and are consumed by implementation agents; PRDs provide product context and scope.
- Do not migrate existing Issue Plan storage as part of this feature. Plan storage can be revisited later as its own migration without changing the PRD model.
- Introduce a PRD command surface for creating, showing, listing, and updating PRDs. PRD status changes are handled through update rather than issue-like workflow movement.
- Default created PRDs to active unless the caller explicitly chooses draft or archived.
- List draft and active PRDs by default, with status filtering available for archived PRDs.
- Support issue creation with PRD and user story flags so automated `to-issues` workflows have a clear structured interface.
- Support explicit commands to link and unlink PRDs from existing issues so humans and agents can fix or backfill traceability.
- Support optional issue markdown sections for PRD and user story references for file-first workflows.
- Preserve issue body markdown exactly as submitted; do not inject or rewrite PRD sections when structured flags are used.
- If both CLI flags and markdown sections specify PRD references, command flags win for structured metadata.
- Parse numbered user stories from the recommended PRD template, especially the User Stories section, but do not require every imported PRD to perfectly match the template.
- Use soft validation for user story references. Store requested references, warn when a referenced story is not found, and surface missing references in prompts.
- Allow linking to archived PRDs with a warning rather than a hard error so historical issues remain valid.
- Do not automatically deduplicate PRDs created from markdown files. Reusing a PRD requires passing an existing PRD ID explicitly.
- Do not automatically rewrite user story references if a PRD body changes later. Missing references should be visible in prompts and JSON output.
- Add a PRD context section to generated prompts after project/repository context and before the issue body.
- Include linked PRD context in all prompt modes: plan, implement, review, and address-review.
- Include PRD metadata, covered user story numbers, found story text, missing story notes, and the full PRD markdown in prompt context.
- Do not add prompt truncation or focused-only PRD context in the first version.
- Update generated Flightdeck skill instructions so `to-prd` maps to PRD creation, and `to-issues` maps to PRD-backed issue creation.
- Update external skill adapter documentation to explain PRD-backed issue publishing, markdown-file import flow, and the distinction between Parent, PRD, and Blocked by.
- Add an ADR documenting first-class DB-backed PRDs, issue PRD links, user story references, and the decision not to use Parent or Issue Plans for PRDs.

## Testing Decisions

- Tests should focus on external behavior through command handlers and CLI flows rather than internal implementation details.
- PRD repository tests should verify project-scoped PRD ID allocation, create/show/list/update behavior, status filtering, and same-project constraints.
- PRD parser tests should verify numbered user story extraction from the recommended template and graceful behavior for missing or malformed sections.
- Issue command tests should verify issue creation with PRD flags, issue creation from markdown PRD sections, flag precedence over markdown, link and unlink commands, cross-project validation, archived PRD warnings, and missing user story warnings.
- Prompt generator tests should verify that all prompt modes include a stable PRD context section when an issue is linked to a PRD.
- Prompt generator tests should verify that covered user stories are highlighted, missing references are called out, and full PRD markdown is included.
- CLI tests should verify the `prd create`, `prd show`, `prd list`, and `prd update` commands, including file body input.
- End-to-end tests should cover a `to-prd`-style flow: create PRD, create linked issues with user story references, generate a prompt, and inspect PRD-linked issue output.
- Generated skill tests should verify concise instructions for `to-prd`, `to-issues`, PRD file import, PRD-backed issue creation, and avoiding Parent for PRDs.
- Documentation tests or snapshot tests should be updated if generated prompt section headings or skill output are snapshotted.

## Out of Scope

- Migrating Issue Plans into database-backed storage.
- Implementing structured parent/sub-issue hierarchy.
- Using Parent as a PRD relationship.
- Using blocker dependencies as PRD relationships.
- Supporting multiple PRDs per issue.
- Supporting cross-project PRD links.
- Automatically deduplicating PRDs by file path or content hash.
- Automatically renumbering or rewriting issue user story references when PRD content changes.
- Deleting PRDs.
- Full-text PRD search.
- Prompt PRD truncation or configurable PRD context modes.
- Web UI changes.
- Cloud sync, external tracker sync, or multi-user collaboration.
- Treating PRDs as issues or moving PRDs through issue queues.

## Further Notes

The key product distinction is that PRDs provide product context and scope, while Issue Plans provide implementation guidance for a single issue. Both may contain markdown, but they are different domain concepts and should remain separate in commands, prompts, storage, and documentation.

The existing Parent section should be preserved as an issue hierarchy concept or legacy source metadata, but it must not become the PRD relationship. The PRD relationship should be structured, same-project, and visible in command JSON and generated prompts.

This feature should optimize for agent clarity over premature abstraction. A dedicated PRD model is preferable to a broad generic document model until Flightdeck has more DB-backed artifact types and clearer shared behavior between them.
