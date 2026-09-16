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
  birthDate:       text("birth_date"),   // ISO date; canonical age source — see app/lib/player-age.ts
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
  extensionSignedAt: text("extension_signed_at"),   // ISO date the extension was signed — drives the dated Hot Off the Press feed (PA8)
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
  // ISO timestamp a human last confirmed capHit/yearsRemaining/expiryStatus/
  // expiryYear against a real source (editor save, paste-box ingest). NOT the
  // same as "internally consistent" — see app/lib/contract-verification.ts.
  // A row's expiryYear = seasonStartYear + yearsRemaining can hold forever
  // even when yearsRemaining hasn't been touched in years; this is the one
  // signal that actually distinguishes "recently confirmed" from "never
  // revisited since the initial sync."
  termVerifiedAt:    text("term_verified_at"),
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

// ── Season analytical snapshots (DATA-06 foundation) ─────────────────────────
// Immutable, additive history of what the valuation engine said about every
// player and team for a season on a given day. One row per
// (season, as_of, model_version, player|team) — `id` encodes all four — and the
// writer only ever INSERTs with ON CONFLICT DO NOTHING, so a row can never be
// rewritten or relabelled to a different season. 2025-26 keeps its own rows;
// 2026-27 starts its own. See docs/analytics/SEASON_SNAPSHOT_CONTRACT.md.
export const playerSeasonSnapshots = sqliteTable("player_season_snapshots", {
  id:                  text("id").primaryKey(),          // "{season}:{asOf}:{modelVersion}:{playerId}"
  playerId:            text("player_id").notNull(),
  teamId:              text("team_id"),
  season:              text("season").notNull(),         // the season this row describes, e.g. "2025-26"
  asOf:                text("as_of").notNull(),          // calendar day (YYYY-MM-DD) the valuation was struck
  source:              text("source").notNull(),
  coverage:            text("coverage").notNull(),       // "completed-season" | "preseason-baseline" | "in-season"
  statsSeason:         text("stats_season").notNull(),   // season whose completed stats fed the engine
  seasonGamesObserved: integer("season_games_observed").notNull(), // games of THIS season in the inputs (0 at preseason)
  contractSeason:      text("contract_season").notNull(),// season of the contract ledger the cap context came from
  modelVersion:        text("model_version").notNull(),
  valuationSnapshotId: text("valuation_snapshot_id").notNull(), // content-addressed id from valuation-snapshot.ts
  position:            text("position").notNull(),
  navLabel:            text("nav_label").notNull(),      // F-NAV | D-NAV | G-NAV | X-NAV
  total:               real("total").notNull(),
  components:          text("components").notNull(),     // JSON NavStage[] — sums to total
  marketValue:         real("market_value"),
  surplus:             real("surplus"),
  uncertaintyLow:      real("uncertainty_low"),
  uncertaintyHigh:     real("uncertainty_high"),
  contract:            text("contract").notNull(),       // JSON ValuationContractSnapshot
  population:          text("population").notNull(),
  // Null means a legacy DATA-06 row that predates verified capture batches.
  // Labs must never infer batch membership from season/as_of alone.
  batchId:             text("batch_id").references(() => seasonSnapshotBatches.id),
  createdAt:           integer("created_at").notNull(),
});

export const teamSeasonSnapshots = sqliteTable("team_season_snapshots", {
  id:                  text("id").primaryKey(),          // "{season}:{asOf}:{modelVersion}:{teamId}"
  teamId:              text("team_id").notNull(),
  season:              text("season").notNull(),
  asOf:                text("as_of").notNull(),
  source:              text("source").notNull(),
  coverage:            text("coverage").notNull(),
  statsSeason:         text("stats_season").notNull(),
  contractSeason:      text("contract_season").notNull(),
  modelVersion:        text("model_version").notNull(),
  rosterCount:         integer("roster_count").notNull(),
  // Signed positional aggregates — Σ NAV with no floor ("Roster X-NAV").
  fNav:                real("f_nav").notNull(),
  dNav:                real("d_nav").notNull(),
  gNav:                real("g_nav").notNull(),
  xnavSigned:          real("xnav_signed").notNull(),    // = f + d + g
  // Positive-assets-only aggregates — Σ max(0, NAV) ("Roster X-NAV+", the chart total).
  fNavPositive:        real("f_nav_positive").notNull(),
  dNavPositive:        real("d_nav_positive").notNull(),
  gNavPositive:        real("g_nav_positive").notNull(),
  xnavPositive:        real("xnav_positive").notNull(),  // = f+ + d+ + g+
  capCeiling:          real("cap_ceiling").notNull(),
  capCommitted:        real("cap_committed").notNull(),
  population:          text("population").notNull(),
  // Null means a legacy DATA-06 row that predates verified capture batches.
  batchId:             text("batch_id").references(() => seasonSnapshotBatches.id),
  createdAt:           integer("created_at").notNull(),
});

// One coherent, verified capture of player and team analytical snapshots.
// Rows only become Labs-eligible when their batch reaches COMPLETE; legacy
// rows intentionally retain a null batch_id rather than fabricated provenance.
export const seasonSnapshotBatches = sqliteTable("season_snapshot_batches", {
  id:                   text("id").primaryKey(),
  season:               text("season").notNull(),
  snapshotKind:         text("snapshot_kind").notNull(), // completed | projected
  asOf:                 text("as_of").notNull(),
  coverage:             text("coverage").notNull(),
  statsSeason:          text("stats_season").notNull(),
  contractSeason:       text("contract_season").notNull(),
  modelVersion:         text("model_version").notNull(),
  status:               text("status").notNull(), // CAPTURING | COMPLETE | FAILED
  expectedPlayers:      integer("expected_players").notNull(),
  capturedPlayers:      integer("captured_players").notNull().default(0),
  expectedTeams:        integer("expected_teams").notNull(),
  capturedTeams:        integer("captured_teams").notNull().default(0),
  skippedPlayers:       integer("skipped_players").notNull().default(0),
  source:               text("source").notNull(),
  population:           text("population").notNull(),
  integrityHash:        text("integrity_hash").notNull(),
  createdBy:            text("created_by").notNull(),
  createdAction:        text("created_action").notNull(),
  createdAt:            integer("created_at").notNull(),
  completedAt:          integer("completed_at"),
  failureReason:        text("failure_reason"),
});

// ── Analytics Labs candidate provenance (Phase 3) ──────────────────────────
// These records describe proposed work only. They are deliberately separate
// from the code-backed production analytics catalog and never select runtime
// implementation, flags, or public calculation behaviour.
export const labsCandidates = sqliteTable("labs_candidates", {
  id:                       text("id").primaryKey(),
  targetAnalyticId:         text("target_analytic_id").notNull(),
  name:                     text("name").notNull(),
  revision:                 text("revision").notNull(),
  implementationIdentity:   text("implementation_identity").notNull(),
  baseAnalyticVersion:      text("base_analytic_version").notNull(),
  baseImplementationIdentity: text("base_implementation_identity").notNull(),
  exposure:                 text("exposure").notNull(), // internal | research
  datasetBatchId:           text("dataset_batch_id").notNull().references(() => seasonSnapshotBatches.id),
  description:              text("description"),
  hypothesis:               text("hypothesis"),
  schemaVersion:            integer("schema_version").notNull(),
  createdAt:                integer("created_at").notNull(),
  createdBy:                text("created_by").notNull(),
  createdSource:            text("created_source").notNull(),
});

export const labsArtifacts = sqliteTable("labs_artifacts", {
  id:                     text("id").primaryKey(),
  kind:                   text("kind").notNull(), // implementation | fitted-model | configuration | report
  contentDigest:          text("content_digest").notNull(), // lowercase SHA-256
  implementationIdentity: text("implementation_identity").notNull(),
  mediaType:              text("media_type").notNull(),
  artifactSchemaVersion:  text("artifact_schema_version").notNull(),
  repositoryCommit:       text("repository_commit"),
  repositoryPath:         text("repository_path"),
  immutableReference:     text("immutable_reference"),
  byteSize:               integer("byte_size"),
  metadataSchemaVersion:  integer("metadata_schema_version").notNull(),
  createdAt:              integer("created_at").notNull(),
  createdBy:              text("created_by").notNull(),
  createdSource:          text("created_source").notNull(),
});

export const labsCandidateArtifacts = sqliteTable("labs_candidate_artifacts", {
  candidateId: text("candidate_id").notNull().references(() => labsCandidates.id),
  artifactId:  text("artifact_id").notNull().references(() => labsArtifacts.id),
  role:        text("role").notNull(),
  attachedAt:  integer("attached_at").notNull(),
  attachedBy:  text("attached_by").notNull(),
});

// The sequence, rather than a timestamp, defines historical ordering. Events
// are append-only; the current candidate lifecycle is derived from this chain.
export const labsCandidateLifecycleEvents = sqliteTable("labs_candidate_lifecycle_events", {
  id:              text("id").primaryKey(),
  candidateId:     text("candidate_id").notNull().references(() => labsCandidates.id),
  sequence:        integer("sequence").notNull(),
  eventType:       text("event_type").notNull(),
  previousStatus:  text("previous_status"),
  resultingStatus: text("resulting_status").notNull(),
  occurredAt:      integer("occurred_at").notNull(),
  actor:           text("actor").notNull(),
  source:          text("source").notNull(),
  note:            text("note"),
  evidenceReference: text("evidence_reference"),
  metadataSchemaVersion: integer("metadata_schema_version").notNull(),
});
