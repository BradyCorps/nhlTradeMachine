import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const teams = sqliteTable("teams", {
  id:               text("id").primaryKey(),
  name:             text("name").notNull(),
  phaseOverride:    text("phase_override"),
  standingOverride: integer("standing_override"),
});

export const players = sqliteTable("players", {
  id:              text("id").primaryKey(),
  name:            text("name").notNull(),
  position:          text("position").notNull(),
  secondaryPosition: text("secondary_position"),
  teamId:            text("team_id").references(() => teams.id),
  age:             integer("age"),
  capHit:          real("cap_hit").notNull(),
  yearsRemaining:  integer("years_remaining").notNull(),
  hasNmc:          integer("has_nmc", { mode: "boolean" }).default(false),
  hasNtc:          integer("has_ntc", { mode: "boolean" }).default(false),
  isLtir:          integer("is_ltir", { mode: "boolean" }).default(false),
  isRetained:      integer("is_retained", { mode: "boolean" }).default(false),
  retainedSalary:  real("retained_salary").default(0),
  draftYear:       integer("draft_year"),
  draftRound:      integer("draft_round"),
  draftOverall:    integer("draft_overall"),     // overall pick number — drives pedigree NAV for prospects
  prospectPtsPace: real("prospect_pts_pace"),    // NHLe-translated junior/college scoring pace
  injuryStatus:    text("injury_status"),
  extensionCapHit: real("extension_cap_hit"),
  extensionYears:  integer("extension_years"),
  retired:         integer("retired", { mode: "boolean" }).default(false),
  retiredDate:     text("retired_date"),
  // Contract + free-agency facts — the single source of truth for reads. The
  // roster read path joins these onto live NHL identity; it no longer scrapes,
  // merges bundled.json, or consults the FA seed at read time.
  expiryStatus:      text("expiry_status"),                 // "UFA" | "RFA" | null — final-year class
  expiryYear:        integer("expiry_year"),                // calendar year the deal ends (e.g. 2026)
  excludeFromRoster: integer("exclude_from_roster", { mode: "boolean" }).default(false),
  // Provenance: 'seed' = canonical baseline, 'sync' = live CapWages ingest,
  // 'editor' = hand-curated. Ingestion never clobbers 'editor' rows.
  source:            text("source").default("seed"),
});

// Global key-value config — cap_ceiling, cap_floor, etc.
export const siteSettings = sqliteTable("site_settings", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

export const tradeBlock = sqliteTable("trade_block", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull(),
  teamId:    text("team_id"),
  position:  text("position"),         // disambiguates same-name players (two Elias Petterssons)
  status:    text("status").notNull(), // 'requested'|'available'|'blocked'|'untouchable'
  note:      text("note"),
  updatedAt: integer("updated_at"),
});

export const trades = sqliteTable("trades", {
  id:            text("id").primaryKey(),
  executedDate:  text("executed_date").notNull(),
  source:        text("source").notNull(),
  sourceUrl:     text("source_url"),
  season:        text("season").notNull(),
  sides:         text("sides").notNull(),
  conditions:    text("conditions"),
  lockedVerdict: text("locked_verdict"),
  gradeAtTrade:  text("grade_at_trade"),
  published:     integer("published", { mode: "boolean" }).notNull().default(false),
  rosterMutating: integer("roster_mutating", { mode: "boolean" }).notNull().default(true),
});

// Draft pick ownership — only stores picks that differ from their natural owner.
// Natural state: currentOwnerId === originalOwnerId. The league route merges these
// overrides onto the runtime-generated pick list so the trade machine reflects reality.
export const draftPickOverrides = sqliteTable("draft_pick_overrides", {
  id:              text("id").primaryKey(),           // "pick-{origOwner}-{year}-{round}"
  currentOwnerId:  text("current_owner_id").notNull(),
  originalOwnerId: text("original_owner_id").notNull(),
  round:           integer("round").notNull(),
  year:            integer("year").notNull(),
  isProtected:     integer("is_protected", { mode: "boolean" }).default(false),
  conditions:      text("conditions"),
  updatedAt:       integer("updated_at"),
});

// Historical NHL snapshots — the perpetual first-party feed. One row per
// player per season per source per capture day (id encodes all four), with
// key signals extracted into columns and the full payload preserved for
// future mining. Populated by /api/admin/nhl-feed.
export const nhlSnapshots = sqliteTable("nhl_snapshots", {
  id:            text("id").primaryKey(),         // "{playerId}-{season}-{source}-{yyyymmdd}"
  playerId:      integer("player_id").notNull(),  // NHL numeric id (the {sku})
  name:          text("name"),
  season:        integer("season").notNull(),     // e.g. 20252026
  source:        text("source").notNull(),        // 'landing' | 'edge'
  capturedAt:    integer("captured_at").notNull(),
  gamesPlayed:   integer("games_played"),
  goals:         integer("goals"),
  assists:       integer("assists"),
  points:        integer("points"),
  shootingPctg:  real("shooting_pctg"),
  ozPct:         real("oz_pct"),
  hdShots:       integer("hd_shots"),
  hdShootingPct: real("hd_shooting_pct"),
  hdFinishingDelta: real("hd_finishing_delta"),   // vs league on high-danger — the luck signal
  payload:       text("payload").notNull(),       // full raw JSON
});

// Admin-managed free-agency overrides — forces a player into/out of the expiring pool
// regardless of what the scraper returns. Lets the admin fix misdetections (e.g. Tuch).
export const faOverrides = sqliteTable("fa_overrides", {
  id:          text("id").primaryKey(),              // normalized player name slug
  playerId:    text("player_id"),                    // canonical player id when selected from DB/admin roster
  playerName:  text("player_name").notNull(),
  teamSlug:    text("team_slug"),                    // optional team filter (match by team)
  forceStatus: text("force_status").notNull(),       // "UFA" | "RFA" | "SIGNED" | "EXCLUDE"
  season:      text("season").notNull(),             // e.g. "2026-27"
  notes:       text("notes"),
  updatedAt:   integer("updated_at"),
});
