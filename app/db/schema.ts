import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const teams = sqliteTable("teams", {
  id:               text("id").primaryKey(),
  name:             text("name").notNull(),
  phaseOverride:    text("phase_override"),
  standingOverride: integer("standing_override"),
});

// Global key-value settings — e.g. cap_ceiling, cap_floor
export const siteSettings = sqliteTable("site_settings", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

export const players = sqliteTable("players", {
  id:              text("id").primaryKey(),
  name:            text("name").notNull(),
  position:        text("position").notNull(),
  teamId:          text("team_id").references(() => teams.id),
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
  injuryStatus:    text("injury_status"),
  extensionCapHit: real("extension_cap_hit"),
  extensionYears:  integer("extension_years"),
});

export const tradeBlock = sqliteTable("trade_block", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull(),
  teamId:    text("team_id"),
  status:    text("status").notNull(), // 'requested'|'available'|'blocked'|'untouchable'
  note:      text("note"),
  updatedAt: integer("updated_at"),
});
