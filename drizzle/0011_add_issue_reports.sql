CREATE TABLE issue_reports (
  id TEXT PRIMARY KEY NOT NULL,
  request_fingerprint TEXT NOT NULL,
  description TEXT NOT NULL,
  page_url TEXT NOT NULL,
  steps TEXT NOT NULL,
  email TEXT NOT NULL,
  browser TEXT NOT NULL,
  viewport_width INTEGER NOT NULL,
  viewport_height INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Investigating', 'Resolved', 'Dismissed')),
  internal_note TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX idx_issue_reports_created ON issue_reports(created_at DESC, id DESC);
