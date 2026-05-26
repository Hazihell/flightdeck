import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { nowIso } from "../time.ts";
import { findIssueByPublicId, resolveBodyInput, IssueRepositoryError } from "./repository.ts";
import type { IssueComment } from "./types.ts";

type CommentRow = {
  id: string;
  issue_id: string;
  body_markdown: string;
  created_at: string;
  updated_at: string;
};

function mapComment(row: CommentRow): IssueComment {
  return {
    id: row.id,
    issueId: row.issue_id,
    bodyMarkdown: row.body_markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function addIssueComment(
  db: Database,
  publicId: string,
  body: string,
): IssueComment {
  const issue = findIssueByPublicId(db, publicId);
  if (!issue) {
    throw new IssueRepositoryError("issue_not_found", `Issue not found: ${publicId}`);
  }

  const bodyMarkdown = resolveBodyInput(body);
  const timestamp = nowIso();
  const comment: IssueComment = {
    id: randomUUID(),
    issueId: issue.id,
    bodyMarkdown,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.query(
    `INSERT INTO issue_comments (id, issue_id, body_markdown, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    comment.id,
    comment.issueId,
    comment.bodyMarkdown,
    comment.createdAt,
    comment.updatedAt,
  );

  return comment;
}

export function listIssueComments(db: Database, issueId: string): IssueComment[] {
  const rows = db
    .query<CommentRow, [string]>(
      "SELECT * FROM issue_comments WHERE issue_id = ? ORDER BY created_at ASC",
    )
    .all(issueId);
  return rows.map(mapComment);
}
