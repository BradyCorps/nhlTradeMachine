import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/app/lib/admin-auth";
import { redis } from "@/app/lib/redis";
import { clearTeamCaches } from "@/app/lib/team-cache";
import {
  searchPlayer,
  pickSearchMatch,
  fetchPlayerLanding,
  mapWithConcurrency,
} from "@/app/lib/nhl-player-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ageFromBirthDate = (birthDate: string): number | null => {
  const b = new Date(birthDate);
  if (!Number.isFinite(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
};

// POST /api/admin/fa-backfill — repair FA-class identity gaps at the
// source. Seed rows for the free-agent class carry age 0 and position
// "Unknown", which the read path papers over with a fake "age 27"
// (the Nyquist bug). This resolves each such row against the NHL
// search API, pulls the landing profile, and writes the real age and
// position into the players table. Same-name collisions (the two
// Elias Petterssons) are reported, never guessed.
export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const rows = await db.select({
    id: playersTable.id,
    name: playersTable.name,
    age: playersTable.age,
    position: playersTable.position,
    expiryStatus: playersTable.expiryStatus,
    retired: playersTable.retired,
  }).from(playersTable);

  const targets = rows.filter((r) =>
    !r.retired &&
    r.expiryStatus != null &&
    ((r.age ?? 0) <= 16 || !r.position || r.position === "Unknown")
  ).slice(0, 60);

  let updated = 0;
  const notFound: string[] = [];
  const ambiguous: string[] = [];
  const details: { name: string; age: number | null; position: string | null }[] = [];

  await mapWithConcurrency(targets, 4, async (row) => {
    const hits = await searchPlayer(row.name);
    const match = pickSearchMatch(hits, row.name);
    if (!match) {
      (hits.length > 1 ? ambiguous : notFound).push(row.name);
      return;
    }
    const { facts } = await fetchPlayerLanding(match.playerId);
    if (!facts) {
      notFound.push(row.name);
      return;
    }
    const age = ageFromBirthDate(facts.birthDate);
    const position = facts.position && facts.position !== "Unknown" ? facts.position : match.positionCode;
    const patch: Record<string, unknown> = {};
    if (age != null && (row.age ?? 0) <= 16) patch.age = age;
    if (position && (!row.position || row.position === "Unknown")) patch.position = position;
    if (Object.keys(patch).length === 0) return;
    await db.update(playersTable).set(patch).where(eq(playersTable.id, row.id)).catch(() => {});
    updated++;
    details.push({ name: row.name, age: (patch.age as number) ?? row.age, position: (patch.position as string) ?? row.position });
  });

  const clearedCacheKeys: string[] = [];
  if (updated > 0) {
    clearedCacheKeys.push(...await clearTeamCaches(redis).catch(() => []));
    if (redis) {
      for (const key of ["cache:contracts", "cache:contracts:v2"]) {
        await redis.del(key).then(() => clearedCacheKeys.push(key)).catch(() => {});
      }
    }
  }

  return NextResponse.json({
    ok: true,
    clearedCacheKeys,
    scanned: targets.length,
    updated,
    notFound,
    ambiguous,
    details,
    note: targets.length === 60 ? "Capped at 60 per call — run again for the rest." : undefined,
  });
}
