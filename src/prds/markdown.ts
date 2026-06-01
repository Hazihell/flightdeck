import type { PrdUserStory } from "./types.ts";

export function extractPrdUserStories(bodyMarkdown: string): PrdUserStory[] {
  const section = extractUserStoriesSection(bodyMarkdown);
  if (!section.trim()) {
    return [];
  }

  const stories: PrdUserStory[] = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^\s*(?:[-*]\s*)?(\d+)[.)]\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }

    const number = Number(match[1]);
    const text = match[2]?.trim() ?? "";
    if (Number.isSafeInteger(number) && number > 0 && text) {
      stories.push({ number, text });
    }
  }

  return stories;
}

function extractUserStoriesSection(markdown: string): string {
  const headingRegex = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  const headings = [...markdown.matchAll(headingRegex)];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading || heading.index === undefined) {
      continue;
    }

    const title = normalizeHeading(heading[2] ?? "");
    if (title !== "user stories" && title !== "user story") {
      continue;
    }

    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    return markdown.slice(start, end);
  }

  return "";
}

function normalizeHeading(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[:#]+$/g, "")
    .trim();
}
