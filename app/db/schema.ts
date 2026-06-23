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
});
