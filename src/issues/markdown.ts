import type { ParsedIssueMarkdown } from "./types.ts";

const SECTION_HEADERS = ["Parent", "What to build", "Acceptance criteria", "Blocked by"] as const;

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

  return {
    parent: parent?.trim() ? parent.trim() : null,
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
