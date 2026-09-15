import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LabsOverview from "@/app/admin/labs/LabsOverview";
import { ANALYTIC_CATALOG } from "@/app/lib/production-analytics";
import type { SeasonSnapshotBatch } from "@/app/lib/season-snapshot";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const verifiedBatch: SeasonSnapshotBatch = {
  id: "snapshot:2025-26:2026-09-13:X-NAV 4.2:5af40ed576d53014",
  season: "2025-26",
  snapshotKind: "completed",
  asOf: "2026-09-13",
  coverage: "completed-season",
  statsSeason: "2025-26",
  contractSeason: "2026-27",
  modelVersion: "X-NAV 4.2",
  status: "COMPLETE",
  expectedPlayers: 1417,
  capturedPlayers: 1417,
  expectedTeams: 32,
  capturedTeams: 32,
  skippedPlayers: 0,
  source: "fixture source",
  population: "fixture population",
  integrityHash: "5af40ed576d53014d16f1048a1977a84f865a5019631ea19615e5cf2b44e0b39",
  createdBy: "fixture",
  createdAction: "fixture",
  createdAt: 1789264480075,
  completedAt: 1789264480075,
  failureReason: null,
};

describe("Phase 2 Analytics Labs Admin overview", () => {
  it("renders production metadata, verified provenance, and explicit legacy warning without mutation controls", () => {
    const html = renderToStaticMarkup(React.createElement(LabsOverview, {
      analytics: ANALYTIC_CATALOG,
      verifiedBatches: [verifiedBatch],
      legacyInventory: { players: 1428, teams: 33 },
      snapshotState: "available",
    }));

    expect(html).toContain("ANALYTICS LABS");
    expect(html).toContain("calculateAssetNAV → calcNAV");
    expect(html).toContain("nav.asset");
    expect(html).toContain("gravity.v4");
    expect(html).toContain("nav01.phase5-calibration");
    expect(html).toContain("Not Labs-eligible");
    expect(html).toContain("1,417 / 1,417 players");
    expect(html).toContain("32 / 32 teams");
    expect(html).toContain("5af40ed576d53014…");
    expect(html).toContain(`Full SHA-256 integrity fingerprint ${verifiedBatch.integrityHash}`);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("player_season_snapshots");
  });

  it("renders an explicit empty verified-dataset state and preserves long identifiers accessibly", () => {
    const html = renderToStaticMarkup(React.createElement(LabsOverview, {
      analytics: ANALYTIC_CATALOG,
      verifiedBatches: [],
      legacyInventory: { players: 0, teams: 0 },
      snapshotState: "unavailable",
    }));

    expect(html).toContain("No verified COMPLETE snapshot batch is currently available.");
    expect(html).toContain("Inventory unavailable");
    expect(read("app/globals.css")).toMatch(/\.admin-labs-safe-text\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
    expect(read("app/globals.css")).toMatch(/\.admin-labs-id\s*,[\s\S]*?word-break:\s*break-word/);
  });

  it("uses server-side inventory and the COMPLETE guard without adding a Labs mutation endpoint", () => {
    const page = read("app/admin/labs/page.tsx");
    const navigation = read("app/admin/layout.tsx");

    expect(page).toContain('seasonSnapshotBatchInventory(db)');
    expect(page).toContain('seasonSnapshotInventory(db, { unbatchedOnly: true })');
    expect(page).toContain('requireCompleteSeasonSnapshotBatch(db, batch.id)');
    expect(page).not.toMatch(/fetch\(|ensureSeasonSnapshotTables|POST|PUT|PATCH|DELETE/);
    expect(navigation).toContain('{ href: "/admin/labs",          label: "ANALYTICS LABS" }');
    expect(existsSync(join(process.cwd(), "app/api/admin/labs"))).toBe(false);
    expect(read("scripts/admin-labs-accessibility.mjs")).toContain("MOB_ADMIN_SESSION_COOKIE is required");
    expect(read("scripts/admin-labs-accessibility.mjs")).toContain("wcag2aa");
    expect(read("scripts/admin-labs-accessibility.mjs")).toContain("smallTargets");
  });
});
