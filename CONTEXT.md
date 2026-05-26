# Flightdeck

Flightdeck is a local-only personal operating system for coordinating work across multiple code projects, agent sessions, and durable planning documents without writing workflow state into those projects.

## Language

**Flightdeck**:
The local personal system that stores projects, issues, docs, and agent-ready prompts across all of the user's work.
_Avoid_: Tracker, board

**Flightdeck Home**:
The global private directory where Flightdeck stores its database, configuration, documents, and exports. It defaults to `~/Flightdeck` and can be overridden with `FLIGHTDECK_HOME`.
_Avoid_: Project folder, repo folder

**Project**:
A registered work context, usually associated with one repository and possibly multiple local checkout paths or worktrees, with its own default instructions and issues.
_Avoid_: Repo when referring to the tracked planning context

**Repository**:
A local source-code checkout that the user or an agent may work in.
_Avoid_: Project when referring specifically to the filesystem checkout

**Project Path**:
A local filesystem path registered to a project. A project can have multiple paths when the same repository is checked out in parallel worktrees.
_Avoid_: Project identity

**Issue**:
A single actionable unit of work that can be triaged, assigned to a human or agent, reviewed, accepted, and completed.
_Avoid_: Card, ticket, task

**Vertical Slice**:
A thin issue that delivers a narrow but complete path through the relevant layers and is demoable or verifiable on its own.
_Avoid_: Layer task, component task

**AFK Issue**:
An issue that an agent can implement without further human interaction.
_Avoid_: Ready issue

**HITL Issue**:
An issue that requires human interaction, such as an architectural decision or design review, before or during execution.
_Avoid_: Blocked issue

**Triage Role**:
A role that describes whether an issue needs evaluation, needs more information, is ready for an agent, is ready for a human, or will not be actioned.
_Avoid_: Workflow status

**Workflow Status**:
The Flightdeck lifecycle position of an issue after or alongside triage, such as in progress, needs review, changes requested, accepted, or done.
_Avoid_: Triage role

**Document**:
A durable note, PRD, decision, plan, or research artifact stored as markdown content and indexed by Flightdeck.
_Avoid_: Issue body

**Agent Prompt**:
A generated instruction packet copied from an issue and project context so an agent can execute or review work with the right constraints.
_Avoid_: Issue body

**Next Issue**:
The issue Flightdeck selects for an agent based on triage role, workflow status, blocker state, plan requirements, and requested prompt mode.
_Avoid_: Top issue

**Plan Prompt**:
An agent prompt that asks an agent to create an unambiguous implementation plan for an issue without modifying product code.
_Avoid_: Implementation prompt

**Implementation Prompt**:
An agent prompt that asks an agent to execute an issue or an approved plan and move the issue toward review.
_Avoid_: Plan prompt

**Issue Plan**:
A durable document linked to an issue that describes how another agent should implement the issue. Complex issues should normally get an issue plan before implementation.
_Avoid_: Issue body

**Review Queue**:
The set of issues whose implementation is ready for user review.
_Avoid_: Done, Accepted

**Blocked Issue**:
An issue that cannot progress because of an explicit blocker reason or dependency while retaining its underlying workflow status.
_Avoid_: Blocked as a standalone status unless later decided

## Domain Boundaries

**Docs vs Issues**:
Documents are durable reference artifacts. Issues are actionable units of work that move through queues.

**Triage Role vs Workflow Status**:
Flightdeck uses triage roles for pickup eligibility and workflow statuses for implementation/review lifecycle. Keep those concepts separate.

**Issue Shape**:
Flightdeck-compatible issue markdown uses `Parent`, `What to build`, `Acceptance criteria`, and `Blocked by` sections.

## Example Dialogue

Developer: "What should I work on next?"

Flightdeck: "There are three ready, unblocked issues. The top issue is in the `ola-ui` project and has a generated agent prompt."

Developer: "Send that to an agent."

Flightdeck: "Copy the agent prompt for the issue. It includes the repository path, goal, acceptance criteria, and project instructions."
