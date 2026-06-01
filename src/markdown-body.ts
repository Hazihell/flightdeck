import { existsSync, readFileSync } from "node:fs";

export function resolveMarkdownBodyInput(body: string, emptyFallback?: string): string {
  const trimmed = body.trim();
  if (!trimmed && emptyFallback !== undefined) {
    return emptyFallback;
  }
  if (existsSync(trimmed)) {
    return readFileSync(trimmed, "utf8");
  }
  return body;
}
