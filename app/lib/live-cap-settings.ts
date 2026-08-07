// ── Canonical server-side cap settings ──────────────────────────────────
// Public clients receive this value from league payloads; server-rendered
// valuation surfaces read it here. One reader prevents a database override
// from describing different leagues on different pages.

import { db } from "@/app/db/client";
import { siteSettings } from "@/app/db/schema";
import {
  isValidCapCeiling,
  parseStoredCapCeiling,
  parseStoredCapFloor,
} from "@/app/lib/cap-settings";
import { SEASON } from "@/app/lib/season-config";

async function readSetting(key: string): Promise<string | undefined> {
  const rows = await db.select().from(siteSettings).catch(() => []);
  return rows.find((row) => row.key === key)?.value;
}

export async function getLiveCapCeiling(
  requested?: number | null,
): Promise<number> {
  if (requested != null && isValidCapCeiling(requested)) return requested;
  return parseStoredCapCeiling(
    await readSetting("cap_ceiling"),
    SEASON.capCeiling,
  ) ?? SEASON.capCeiling;
}

export async function getLiveCapFloor(): Promise<number> {
  return parseStoredCapFloor(
    await readSetting("cap_floor"),
    SEASON.capFloor,
  ) ?? SEASON.capFloor;
}
