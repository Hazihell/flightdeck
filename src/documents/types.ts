export const DOCUMENT_KINDS = ["plan"] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const ISSUE_DOCUMENT_LINK_KINDS = ["plan"] as const;

export type IssueDocumentLinkKind = (typeof ISSUE_DOCUMENT_LINK_KINDS)[number];

export type Document = {
  id: string;
  kind: DocumentKind;
  relativePath: string;
  createdAt: string;
  updatedAt: string;
};

export type IssueDocumentLink = {
  id: string;
  issueId: string;
  documentId: string;
  linkKind: IssueDocumentLinkKind;
  createdAt: string;
};
