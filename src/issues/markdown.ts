import type { ParsedIssueMarkdown } from "./types.ts";

const SECTION_HEADERS = [
  "Parent",
  "PRD",
  "User stories",
  "What to build",
  "Acceptance criteria",
  "Blocked by",
] as const;

type SectionHeader = (typeof SECTION_HEADERS)[number];

export const PUBLIC_ID_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;
export const PRD_PUBLIC_ID_PATTERN = /^[A-Z][A-Z0-9]*-PRD-\d+$/;

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
  const prd = parsePrdSection(sections.get("PRD") ?? null);
  const userStoryNumbers = parseUserStorySection(sections.get("User stories") ?? "");
  const whatToBuild = sections.get("What to build") ?? null;
  const acceptanceCriteria = parseAcceptanceCriteria(sections.get("Acceptance criteria") ?? "");
  const blockedByRaw = sections.get("Blocked by") ?? null;
  const { dependencyPublicIds, manualBlockerFromMarkdown } = parseBlockedBySection(blockedByRaw);

  return {
    parent: parent?.trim() ? parent.trim() : null,
    prdPublicId: prd,
    userStoryNumbers,
    whatToBuild: whatToBuild?.trim() ? whatToBuild.trim() : null,
    acceptanceCriteria,
    blockedByRaw: blockedByRaw?.trim() ? blockedByRaw.trim() : null,
    dependencyPublicIds,
    manualBlockerFromMarkdown,
  };
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
    const canonicalTitle = title ? canonicalSectionTitle(title) : null;
    if (!canonicalTitle) {
      continue;
    }
    const start = match.index + match[0].length;
    const end = matches[i + 1]?.index ?? markdown.length;
    sections.set(canonicalTitle, markdown.slice(start, end));
  }

  return sections;
}

function canonicalSectionTitle(title: string): SectionHeader | null {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[:#]+$/g, "")
    .trim();

  if (normalized === "parent") {
    return "Parent";
  }
  if (normalized === "prd" || normalized === "linked prd" || normalized === "source prd") {
    return "PRD";
  }
  if (
    normalized === "user story" ||
    normalized === "user stories" ||
    normalized === "user story references" ||
    normalized === "user stories covered"
  ) {
    return "User stories";
  }
  if (normalized === "what to build") {
    return "What to build";
  }
  if (normalized === "acceptance criteria") {
    return "Acceptance criteria";
  }
  if (normalized === "blocked by") {
    return "Blocked by";
  }
  return null;
}

function parsePrdSection(section: string | null): string | null {
  if (!section?.trim()) {
    return null;
  }
  const match = section.toUpperCase().match(/\b([A-Z][A-Z0-9]*-PRD-\d+)\b/);
  const publicId = match?.[1] ?? null;
  return publicId && PRD_PUBLIC_ID_PATTERN.test(publicId) ? publicId : null;
}

function parseUserStorySection(section: string): number[] {
  const seen = new Set<number>();
  const numbers: number[] = [];

  for (const match of section.matchAll(/\b(\d+)(?:\s*-\s*(\d+))?\b/g)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start <= 0 || end <= 0) {
      continue;
    }
    if (end < start) {
      continue;
    }
    for (let number = start; number <= end; number += 1) {
      if (!seen.has(number)) {
        seen.add(number);
        numbers.push(number);
      }
    }
  }

  return numbers;
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
