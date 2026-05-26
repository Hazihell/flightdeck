import type { Database } from "bun:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { nowIso } from "../time.ts";
import type { Document, DocumentKind, IssueDocumentLink, IssueDocumentLinkKind } from "./types.ts";

type DocumentRow = {
  id: string;
  kind: string;
  relative_path: string;
  created_at: string;
  updated_at: string;
};

type LinkRow = {
  id: string;
  issue_id: string;
  document_id: string;
  link_kind: string;
  created_at: string;
};

export class DocumentRepositoryError extends Error {
  readonly code:
    | "path_outside_home"
    | "document_not_found"
    | "link_not_found";

  constructor(
    code: "path_outside_home" | "document_not_found" | "link_not_found",
    message: string,
  ) {
    super(message);
    this.name = "DocumentRepositoryError";
    this.code = code;
  }
}

function mapDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    kind: row.kind as DocumentKind,
    relativePath: row.relative_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLink(row: LinkRow): IssueDocumentLink {
  return {
    id: row.id,
    issueId: row.issue_id,
    documentId: row.document_id,
    linkKind: row.link_kind as IssueDocumentLinkKind,
    createdAt: row.created_at,
  };
}

export function planRelativePath(publicId: string): string {
  return `documents/issues/${publicId}/plan.md`;
}

function resolveDocumentPath(home: string, relativePath: string): string {
  const absolute = resolve(home, relativePath);
  const homeResolved = resolve(home);
  if (!absolute.startsWith(homeResolved + "/") && absolute !== homeResolved) {
    throw new DocumentRepositoryError(
      "path_outside_home",
      `Document path must stay inside Flightdeck Home: ${relativePath}`,
    );
  }
  return absolute;
}

export async function writeMarkdownDocument(
  home: string,
  relativePath: string,
  content: string,
): Promise<string> {
  const absolutePath = resolveDocumentPath(home, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

export async function readMarkdownDocument(
  home: string,
  relativePath: string,
): Promise<string> {
  const absolutePath = resolveDocumentPath(home, relativePath);
  return readFile(absolutePath, "utf8");
}

export function upsertDocument(
  db: Database,
  input: {
    kind: DocumentKind;
    relativePath: string;
  },
): Document {
  const existing = db
    .query<DocumentRow, [string]>(
      "SELECT * FROM documents WHERE relative_path = ?",
    )
    .get(input.relativePath);

  if (existing) {
    const timestamp = nowIso();
    db.query("UPDATE documents SET updated_at = ? WHERE id = ?").run(
      timestamp,
      existing.id,
    );
    return mapDocument({ ...existing, updated_at: timestamp });
  }

  const timestamp = nowIso();
  const document: Document = {
    id: randomUUID(),
    kind: input.kind,
    relativePath: input.relativePath,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  db.query(
    `INSERT INTO documents (id, kind, relative_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    document.id,
    document.kind,
    document.relativePath,
    document.createdAt,
    document.updatedAt,
  );

  return document;
}

export function linkDocumentToIssue(
  db: Database,
  input: {
    issueId: string;
    documentId: string;
    linkKind: IssueDocumentLinkKind;
  },
): IssueDocumentLink {
  const existing = db
    .query<LinkRow, [string, string]>(
      "SELECT * FROM issue_document_links WHERE issue_id = ? AND link_kind = ?",
    )
    .get(input.issueId, input.linkKind);

  if (existing) {
    db.query(
      "UPDATE issue_document_links SET document_id = ? WHERE id = ?",
    ).run(input.documentId, existing.id);
    return mapLink({ ...existing, document_id: input.documentId });
  }

  const link: IssueDocumentLink = {
    id: randomUUID(),
    issueId: input.issueId,
    documentId: input.documentId,
    linkKind: input.linkKind,
    createdAt: nowIso(),
  };

  db.query(
    `INSERT INTO issue_document_links (id, issue_id, document_id, link_kind, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(link.id, link.issueId, link.documentId, link.linkKind, link.createdAt);

  return link;
}

export function findIssueDocumentLink(
  db: Database,
  issueId: string,
  linkKind: IssueDocumentLinkKind,
): IssueDocumentLink | null {
  const row = db
    .query<LinkRow, [string, string]>(
      "SELECT * FROM issue_document_links WHERE issue_id = ? AND link_kind = ?",
    )
    .get(issueId, linkKind);
  return row ? mapLink(row) : null;
}

export function findDocumentById(db: Database, id: string): Document | null {
  const row = db.query<DocumentRow, [string]>("SELECT * FROM documents WHERE id = ?").get(id);
  return row ? mapDocument(row) : null;
}

export function documentAbsolutePath(home: string, document: Document): string {
  return join(home, document.relativePath);
}
