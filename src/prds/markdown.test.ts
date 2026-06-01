import { describe, expect, test } from "bun:test";

import { extractPrdUserStories } from "./markdown.ts";

describe("prd markdown", () => {
  test("extracts numbered user stories from the recommended section", () => {
    const stories = extractPrdUserStories(`# PRD

## Problem

Some context.

## User Stories

1. As a user, I want to list PRDs, so that I can find active documents.
2. As an agent, I want JSON user stories, so that I can reason about coverage.
- 39. As an agent, I want missing references to warn, so that work is not blocked.

## Scope

- Build it.
`);

    expect(stories).toEqual([
      {
        number: 1,
        text: "As a user, I want to list PRDs, so that I can find active documents.",
      },
      {
        number: 2,
        text: "As an agent, I want JSON user stories, so that I can reason about coverage.",
      },
      {
        number: 39,
        text: "As an agent, I want missing references to warn, so that work is not blocked.",
      },
    ]);
  });

  test("returns an empty list for missing or malformed user story sections", () => {
    expect(extractPrdUserStories("# PRD\n\n## Scope\n\nNo stories.")).toEqual([]);
    expect(extractPrdUserStories("## User Stories\n\nAs a user, no number.")).toEqual([]);
  });
});
