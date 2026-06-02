import type { ParsedIssueMarkdown } from "./types.ts";

const SECTION_HEADERS = [
  "Parent",
  "What to build",
  "Acceptance criteria",
  "Blocked by",
  "PRD",
  "User stories",
  "User Stories",
] as const;

const PRD_PUBLIC_ID_PATTERN = /\b([A-Z][A-Z0-9]*-PRD-\d+)\b/;

export const PUBLIC_ID_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;

export const DEFAULT_ISSUE_BODY = `## Parent

## What to build

## Acceptance criteria

- [ ]

## Blocked by

None - can start immediately
`;

export function parseIssueMarkdown(bodyMarkdown: string): ParsedIssueMarkdown {
  const sections = splitSections(bodyMarkdown);

  const parent = sections.get("Parent") ?? null;
  const whatToBuild = sections.get("What to build") ?? null;
  const acceptanceCriteria = parseAcceptanceCriteria(sections.get("Acceptance criteria") ?? "");
  const blockedByRaw = sections.get("Blocked by") ?? null;
  const { dependencyPublicIds, manualBlockerFromMarkdown } = parseBlockedBySection(blockedByRaw);
  const prdSection = sections.get("PRD") ?? null;
  const userStoriesSection = sections.get("User stories") ?? sections.get("User Stories") ?? null;

  return {
    parent: parent?.trim() ? parent.trim() : null,
    whatToBuild: whatToBuild?.trim() ? whatToBuild.trim() : null,
    acceptanceCriteria,
    blockedByRaw: blockedByRaw?.trim() ? blockedByRaw.trim() : null,
    dependencyPublicIds,
    manualBlockerFromMarkdown,
    prdPublicIdFromMarkdown: parsePrdSection(prdSection),
    userStoryNumbersFromMarkdown: parseUserStoryNumbersFromSection(userStoriesSection),
  };
}

function parsePrdSection(section: string | null): string | null {
  if (!section?.trim()) {
    return null;
  }

  const match = section.match(PRD_PUBLIC_ID_PATTERN);
  return match?.[1] ?? null;
}

function parseUserStoryNumbersFromSection(section: string | null): number[] {
  if (!section?.trim()) {
    return [];
  }

  const seen = new Set<number>();
  const numbers: number[] = [];

  const addNumber = (value: number): void => {
    if (!Number.isSafeInteger(value) || value <= 0 || seen.has(value)) {
      return;
    }
    seen.add(value);
    numbers.push(value);
  };

  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const numbered = trimmed.match(/^(?:[-*]\s*)?(\d+)[.)](?:\s+|$)/);
    if (numbered) {
      addNumber(Number(numbered[1]));
      continue;
    }

    const bulletNumber = trimmed.match(/^[-*]\s+(\d+)\s*$/);
    if (bulletNumber) {
      addNumber(Number(bulletNumber[1]));
      continue;
    }

    for (const token of trimmed.split(/[\s,]+/)) {
      const cleaned = token.replace(/^[-*]\s*/, "").replace(/[.)]$/, "");
      const number = Number(cleaned);
      if (Number.isSafeInteger(number) && number > 0) {
        addNumber(number);
      }
    }
  }

  return numbers;
}

function splitSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const headerRegex = /^## (.+)$/gm;
  const matches = [...markdown.matchAll(headerRegex)];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    if (!match || match.index === undefined) {
      continue;
    }
    const title = match[1]?.trim();
    if (!title || !isKnownSection(title)) {
      continue;
    }
    const start = match.index + match[0].length;
    const end = matches[i + 1]?.index ?? markdown.length;
    sections.set(title, markdown.slice(start, end));
  }

  return sections;
}

function isKnownSection(title: string): boolean {
  return (SECTION_HEADERS as readonly string[]).includes(title);
}

function parseAcceptanceCriteria(section: string): string[] {
  const items: string[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const checkbox = trimmed.match(/^- \[[ xX]\]\s*(.*)$/);
    if (checkbox) {
      items.push(checkbox[1]?.trim() ?? "");
      continue;
    }
    if (trimmed.startsWith("- ")) {
      items.push(trimmed.slice(2).trim());
    }
  }
  return items;
}

function parseBlockedBySection(blockedBy: string | null): {
  dependencyPublicIds: string[];
  manualBlockerFromMarkdown: string | null;
} {
  if (!blockedBy?.trim()) {
    return { dependencyPublicIds: [], manualBlockerFromMarkdown: null };
  }

  const lines = blockedBy
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const dependencyPublicIds: string[] = [];
  const manualLines: string[] = [];

  for (const line of lines) {
    const idsOnLine = extractPublicIds(line);
    if (idsOnLine.length > 0) {
      for (const id of idsOnLine) {
        if (!dependencyPublicIds.includes(id)) {
          dependencyPublicIds.push(id);
        }
      }
      const remainder = line
        .replace(/[A-Z][A-Z0-9]*-\d+/g, "")
        .replace(/^[-*]\s*/, "")
        .trim();
      if (remainder && !isNoneLine(remainder)) {
        manualLines.push(remainder);
      }
      continue;
    }

    if (!isNoneLine(line)) {
      manualLines.push(line);
    }
  }

  return {
    dependencyPublicIds,
    manualBlockerFromMarkdown: manualLines.length > 0 ? manualLines.join("\n") : null,
  };
}

function isNoneLine(line: string): boolean {
  const normalized = line.toLowerCase().replace(/[.!]/g, "").trim();
  return (
    normalized === "none" ||
    normalized === "none - can start immediately" ||
    normalized.startsWith("none -")
  );
}

export function extractPublicIds(text: string): string[] {
  const ids: string[] = [];
  const tokenRegex = /\b([A-Z][A-Z0-9]*-\d+)\b/g;
  for (const match of text.matchAll(tokenRegex)) {
    const id = match[1];
    if (id && PUBLIC_ID_PATTERN.test(id) && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}
