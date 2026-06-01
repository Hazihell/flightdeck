export const SCHEMA_VERSION = 4;

export const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        instructions TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_paths (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id),
        path TEXT UNIQUE NOT NULL,
        kind TEXT NOT NULL,
        label TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS project_issue_sequences (
        project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id),
        next_sequence INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY NOT NULL,
        public_id TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id),
        sequence INTEGER NOT NULL,
        title TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        triage_role TEXT NOT NULL,
        workflow_status TEXT NOT NULL,
        work_type TEXT,
        complexity TEXT NOT NULL,
        plan_status TEXT NOT NULL,
        manual_blocker TEXT NOT NULL DEFAULT '',
        branch TEXT,
        worktree_path TEXT,
        pr_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (project_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS issue_dependencies (
        id TEXT PRIMARY KEY NOT NULL,
        issue_id TEXT NOT NULL REFERENCES issues(id),
        blocker_issue_id TEXT NOT NULL REFERENCES issues(id),
        created_at TEXT NOT NULL,
        UNIQUE (issue_id, blocker_issue_id)
      );
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE issues ADD COLUMN validation_summary TEXT;
      ALTER TABLE issues ADD COLUMN commit_ref TEXT;

      CREATE TABLE IF NOT EXISTS issue_comments (
        id TEXT PRIMARY KEY NOT NULL,
        issue_id TEXT NOT NULL REFERENCES issues(id),
        body_markdown TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        relative_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS issue_document_links (
        id TEXT PRIMARY KEY NOT NULL,
        issue_id TEXT NOT NULL REFERENCES issues(id),
        document_id TEXT NOT NULL REFERENCES documents(id),
        link_kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (issue_id, link_kind)
      );
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS project_prd_sequences (
        project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id),
        next_sequence INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS prds (
        id TEXT PRIMARY KEY NOT NULL,
        public_id TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id),
        sequence INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (project_id, sequence)
      );
    `,
  },
];
