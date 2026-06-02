# Repository Guidelines

## Project Structure & Module Organization

Flightdeck is a local-only Bun/TypeScript CLI. Source lives in `src/`, with CLI entry points in `src/cli.ts` and `src/index.ts`. Feature modules are grouped under `src/issues/`, `src/prds/`, `src/projects/`, `src/prompts/`, `src/documents/`, and `src/db/`. Tests are colocated as `*.test.ts`; fixtures live in `src/testing/`. Documentation and ADRs are in `docs/`, and `CONTEXT.md` defines terminology.

## Build, Test, and Development Commands

- `bun install`: install dependencies from `bun.lock`.
- `bun run deck -- --help`: run the CLI locally.
- `bun test`: run the full Bun test suite.
- `bun run smoke`: run `src/e2e.test.ts`.
- `bun run typecheck`: run `tsc --noEmit`.
- `bun run lint`: run Oxlint over `src/`.
- `bun run fmt`: format `README.md`, `docs/`, and `src/`.
- `bun run check`: run typecheck, lint, and formatting.

## Testing Guidelines

Use `bun:test` with `describe`, `test`, and `expect`. Keep tests near the code they cover, named `feature.test.ts`; snapshots belong in `__snapshots__/`. State-touching tests should use isolated temporary `FLIGHTDECK_HOME` directories, following `src/testing/`. Run `bun test` before finishing behavioral changes.

## Task Completion Requirements

- Run `bun run fmt` before final validation so formatting is written, not only checked.
- All of `bun run lint` and `bun run typecheck` must pass before considering tasks completed.
- Run targeted tests for changed behavior, such as `bun test src/issues/workflow.test.ts`.
- Run `bun run smoke` only when end-to-end CLI flows, persistence, queue selection, or prompt generation are touched.
- Never run `bun run build`; this is for CI only.
- If a required command cannot run, document the reason and remaining risk.

## Commit & Pull Request Guidelines

Git history uses conventional commits, often scoped: `feat(issue): Link issues to PRDs`, `docs(prd): add first-class PRD support specification`, `ci(tooling): Adopt Oxc formatter and linter`. Use `type(scope): imperative summary`. PRs should include a concise description, linked issue or PRD, test results, and screenshots only for user-visible output changes.

## Security & Configuration Tips

Flightdeck stores state outside project repositories, defaulting to `~/Flightdeck` or `FLIGHTDECK_HOME`. Do not commit local databases, generated home directories, secrets, or private issue content. Use `FLIGHTDECK_HOME` overrides for tests and experiments.
