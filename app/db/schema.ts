import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(), // e.g. "EDM"
  name: text("name").notNull(),
  phaseOverride: text("phase_override"), // e.g. "Contender", "Rebuilding", etc.
  standingOverride: integer("standing_override"), // Manual standing rank override
});

export const players = sqliteTable("players", {
  id: text("id").primaryKey(), // Unique ID, typically Name + DOB hash or UUID
  name: text("name").notNull(),
  position: text("position").notNull(), // "C", "W", "D", "G", "Pick", etc.
  teamId: text("team_id").references(() => teams.id), // "EDM"
  age: integer("age"),
  capHit: real("cap_hit").notNull(),
  yearsRemaining: integer("years_remaining").notNull(),
  
  // Contract specific rules
  hasNmc: integer("has_nmc", { mode: "boolean" }).default(false),
  hasNtc: integer("has_ntc", { mode: "boolean" }).default(false),
  isLtir: integer("is_ltir", { mode: "boolean" }).default(false),
  isRetained: integer("is_retained", { mode: "boolean" }).default(false),
  retainedSalary: real("retained_salary").default(0),
  
  // Draft info (for picks and prospects)
  draftYear: integer("draft_year"),
  draftRound: integer("draft_round"),
  
  // Custom manual flags
  injuryStatus: text("injury_status"),
  secondaryPosition: text("secondary_position"),
});
