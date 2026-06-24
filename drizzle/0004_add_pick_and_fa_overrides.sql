CREATE TABLE IF NOT EXISTS draft_pick_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  current_owner_id TEXT NOT NULL,
  original_owner_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  year INTEGER NOT NULL,
  is_protected INTEGER DEFAULT 0,
  conditions TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS fa_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  player_name TEXT NOT NULL,
  team_slug TEXT,
  force_status TEXT NOT NULL,
  season TEXT NOT NULL,
  notes TEXT,
  updated_at INTEGER
);
