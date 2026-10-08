import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { siteSettings } from "@/app/db/schema";
import { manualLineupKey, storedManualLineupSchema, type ManualLineupInput, type ManualTeamLineup } from "./manual-team-lineups";
import type { ObservedSelection } from "./observed-season";

export class LineupConflict extends Error {
  constructor() { super("This lineup changed in another session. Reload before saving."); }
}

let databaseModule: Promise<typeof import("@/app/db/client")> | undefined;
const loadDatabase = () => databaseModule ??= import("@/app/db/client");

async function readRow(teamId: string, selection: ObservedSelection) {
  const { db } = await loadDatabase();
  const key = manualLineupKey(teamId, selection);
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  const raw = rows[0]?.value;
  if (raw === undefined) return { db, key, raw, lineup: null };
  const lineup = storedManualLineupSchema.parse(JSON.parse(raw));
  if (lineup.teamId !== teamId || lineup.season !== selection.season || lineup.gameType !== selection.gameType) {
    throw new Error("Stored lineup identity does not match this team and season");
  }
  return { db, key, raw, lineup };
}

export async function readManualLineup(teamId: string, selection: ObservedSelection): Promise<ManualTeamLineup | null> {
  return (await readRow(teamId, selection)).lineup;
}

export async function saveManualLineup(input: ManualLineupInput, expectedRevision: string | null): Promise<ManualTeamLineup> {
  const current = await readRow(input.teamId, input);
  if ((current.lineup?.revision ?? null) !== expectedRevision) throw new LineupConflict();
  const lineup = { ...input, revision: randomUUID(), updatedAt: new Date().toISOString() };
  const value = JSON.stringify(lineup);
  const result = current.raw === undefined
    ? await current.db.insert(siteSettings).values({ key: current.key, value }).onConflictDoNothing()
    : await current.db.update(siteSettings).set({ value }).where(and(eq(siteSettings.key, current.key), eq(siteSettings.value, current.raw)));
  if (result.rowsAffected !== 1) throw new LineupConflict();
  return lineup;
}

export async function removeManualLineup(teamId: string, selection: ObservedSelection, expectedRevision: string): Promise<void> {
  const current = await readRow(teamId, selection);
  if (!current.lineup || current.lineup.revision !== expectedRevision || current.raw === undefined) throw new LineupConflict();
  const result = await current.db.delete(siteSettings).where(and(eq(siteSettings.key, current.key), eq(siteSettings.value, current.raw)));
  if (result.rowsAffected !== 1) throw new LineupConflict();
}

if (typeof window !== "undefined") throw new Error("Manual lineup storage requires a server runtime");
