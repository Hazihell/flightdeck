import { describe, expect, test } from "bun:test";
import { parseIssueMarkdown } from "./markdown.ts";

const FULL_BODY = `## Parent

Parent issue OLA-10

## What to build

Add login form validation.

## Acceptance criteria

- [ ] Email field validates format
- [ ] Password field requires 8+ characters

## Blocked by

OLA-9
`;

describe("issue markdown parser", () => {
  test("extracts Flightdeck-compatible sections from full body", () => {
    const parsed = parseIssueMarkdown(FULL_BODY);
    expect(parsed.parent).toBe("Parent issue OLA-10");
    expect(parsed.whatToBuild).toBe("Add login form validation.");
    expect(parsed.acceptanceCriteria).toEqual([
      "Email field validates format",
      "Password field requires 8+ characters",
    ]);
    expect(parsed.blockedByRaw).toBe("OLA-9");
    expect(parsed.dependencyPublicIds).toEqual(["OLA-9"]);
    expect(parsed.manualBlockerFromMarkdown).toBeNull();
  });

  test("treats none blocker text as unblocked in markdown", () => {
    const parsed = parseIssueMarkdown(`## Blocked by

None - can start immediately
`);
    expect(parsed.dependencyPublicIds).toEqual([]);
    expect(parsed.manualBlockerFromMarkdown).toBeNull();
  });

  test("allows missing optional sections", () => {
    const parsed = parseIssueMarkdown(`## What to build

Ship it.
`);
    expect(parsed.parent).toBeNull();
    expect(parsed.whatToBuild).toBe("Ship it.");
    expect(parsed.acceptanceCriteria).toEqual([]);
    expect(parsed.blockedByRaw).toBeNull();
  });

  test("extracts manual blocker text without public IDs", () => {
    const parsed = parseIssueMarkdown(`## Blocked by

Waiting on vendor API credentials
`);
    expect(parsed.dependencyPublicIds).toEqual([]);
    expect(parsed.manualBlockerFromMarkdown).toBe(
      "Waiting on vendor API credentials",
    );
  });

  test("extracts multiple dependency references", () => {
    const parsed = parseIssueMarkdown(`## Blocked by

OLA-1
OLA-2
`);
    expect(parsed.dependencyPublicIds).toEqual(["OLA-1", "OLA-2"]);
  });

  test("preserves canonical markdown by not mutating input", () => {
    const body = FULL_BODY;
    parseIssueMarkdown(body);
    expect(body).toBe(FULL_BODY);
  });
});
