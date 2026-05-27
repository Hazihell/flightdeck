# Agent workflows

Flightdeck selects work through mode-specific **next queues** and generates **agent prompts** with the right repository path, issue body, project instructions, and update commands.

## Prompt modes

| Mode           | Command                                 | Purpose                                            |
| -------------- | --------------------------------------- | -------------------------------------------------- |
| Plan           | `deck issue next --mode plan`           | Create an implementation plan before code changes. |
| Implement      | `deck issue next --mode implement`      | Execute a simple issue or an approved plan.        |
| Review         | `deck issue next --mode review`         | Review completed implementation (`needs-review`).  |
| Address review | `deck issue next --mode address-review` | Fix issues after `changes-requested`.              |

Generate a prompt for a known issue:

```bash
deck issue prompt OLA-12 --mode implement --json
```

## Plan workflow

For `complexity=needs-plan` issues:

1. **Select** — `deck issue next --mode plan --project OLA`
2. **Prompt** — `deck issue prompt OLA-12 --mode plan`
3. **Attach plan** — agent writes markdown; user or agent runs:
   ```bash
   deck issue attach-plan OLA-12 --body ./plan.md --json
   ```
4. **Approve** — human or trusted step:
   ```bash
   deck issue approve-plan OLA-12 --json
   ```
5. Issue becomes eligible for `deck issue next --mode implement` when also unblocked and `ready-for-agent`.

`needs-plan` issues are **not** implementable until `plan_status` is `approved`.

## Implement workflow

1. **Select** — `deck issue next --mode implement`
2. **Prompt** — `deck issue prompt <PUBLIC_ID> --mode implement`
3. **Start work**:
   ```bash
   deck issue move OLA-12 --status in-progress --validation "Started implementation"
   ```
4. Optional git metadata (stored only, not automated):
   ```bash
   deck issue move OLA-12 --status in-progress \
     --branch feat/ola-12 \
     --worktree-path /path/to/worktree \
     --commit abc123 \
     --pr-url https://example.com/pull/1
   ```
5. **Submit for review**:
   ```bash
   deck issue move OLA-12 --status needs-review --validation "bun test passed"
   ```

## Review workflow

1. **Select** — `deck issue next --mode review`
2. **Prompt** — `deck issue prompt <PUBLIC_ID> --mode review`
3. **Accept** (human checkpoint; does not unblock dependents):
   ```bash
   deck issue move OLA-12 --status accepted --validation "LGTM"
   ```
4. **Request changes**:
   ```bash
   deck issue move OLA-12 --status changes-requested --validation "Fix edge case in Banner"
   ```
5. **Complete** (unblocks dependency issues):
   ```bash
   deck issue move OLA-12 --status done
   ```

## Address-review workflow

When status is `changes-requested` and the issue is unblocked:

1. **Select** — `deck issue next --mode address-review`
2. **Prompt** — `deck issue prompt <PUBLIC_ID> --mode address-review`
3. **Fix and re-submit**:
   ```bash
   deck issue move OLA-12 --status needs-review --validation "Addressed review feedback"
   ```

## Comments and notes

Record review or implementation notes without changing workflow status:

```bash
deck issue comment OLA-12 --body "## Review\n\n- [ ] Adjust spacing"
```

## Inspecting state

```bash
deck issue show OLA-12 --json
deck issue list --project OLA --status backlog --triage-role ready-for-agent --json
```

## Unblocked rule

An issue is eligible for `plan`, `implement`, and `address-review` queues only when:

- `manual_blocker` is empty
- Every dependency blocker has `workflow_status: done` (not merely `accepted`)
- `triage_role` is not `needs-info` or `wontfix`

## Required commands in prompts

Generated prompts include a **Required Flightdeck commands** section listing `deck issue move`, `deck issue comment`, and mode-appropriate updates. Agents should run those commands to keep tracker state current.
