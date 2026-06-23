CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY NOT NULL,
  executed_date TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  season TEXT NOT NULL,
  sides TEXT NOT NULL,
  conditions TEXT,
  locked_verdict TEXT,
  grade_at_trade TEXT,
  published INTEGER NOT NULL DEFAULT 0
);
