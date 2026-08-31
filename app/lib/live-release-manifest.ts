// ── live-release-manifest.ts ────────────────────────────────────────────
//
// DATA-06: wires a real, already-loaded roster snapshot into the manifest
// infrastructure `release-manifest.ts`/`release-gates.ts` already built.
//
// Only the domains a plain roster/navMap snapshot can actually verify
// without a specific trade proposal are wired here — `capPickReconciliation`
// and `retentionSlotGate` need a real trade's before/after state, so they
// stay per-trade checks rather than being forced into a general health
// read. `noFutureInformationLeakage` is inherently about a simulated/
// historical `as_of` state, which the live roster is not. The remaining
// domains (stats, picks, fantasy, simulation) are left unwired — per
// `buildDomainManifest`'s own rule, an unwired domain reads `degraded` with
// an explicit "no gates ran" warning, never fabricated as `live`.
//
// This module does no I/O — it takes an already-loaded roster snapshot
// (the same shape `getCachedRoster()` already returns) and reports on it.

import { XNAV_MODEL_VERSION } from "@/app/lib/data-context";
import { SEASON_START_YEAR } from "@/app/lib/contract-expiry";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import { rosterLegality } from "@/app/lib/roster-legality";
import { TEAMS_DB } from "@/app/lib/db";
import {
  exactNameAliasInvariance,
  contractStatusAgeInvariant,
  teamPopulationLineupInvariant,
  crossSurfaceValueReconciliation,
  missingDataUncertaintyInvariant,
  freeAgentPoolConsistencyInvariant,
} from "@/app/lib/release-gates";
import {
  buildDomainManifest, buildReleaseManifest,
  type ReleaseManifest, type DomainManifest,
} from "@/app/lib/release-manifest";
import { snapshotDate } from "@/app/lib/valuation-snapshot";
import type { Asset } from "@/app/lib/trade-types";

export interface LiveRosterSnapshot {
  players: Asset[];
  generatedAt: string | null;
  capCeiling?: number | null;
}

function buildRosterDomain(players: Asset[], generatedAt: string | null): DomainManifest {
  const gate = exactNameAliasInvariance(players.map((p) => ({ nhlId: p.id, name: p.name })));
  return buildDomainManifest({
    domain: "roster",
    lastSuccessfulIngest: generatedAt,
    coverage: `${players.length} player(s)`,
    modelVersion: XNAV_MODEL_VERSION,
    gates: [gate],
  });
}

function buildContractsDomain(players: Asset[], generatedAt: string | null): DomainManifest {
  const ageGate = contractStatusAgeInvariant(
    players.map((p) => ({
      id: p.id, age: p.age, expiryStatus: p.expiryStatus,
      expiryYear: p.expiryYear, offseasonYear: SEASON_START_YEAR,
    })),
  );
  const poolGate = freeAgentPoolConsistencyInvariant(
    players.map((p) => ({ id: p.id, teamId: p.teamId, contractStatus: p.contractStatus })),
  );
  return buildDomainManifest({
    domain: "contracts",
    lastSuccessfulIngest: generatedAt,
    coverage: `${players.length} player(s)`,
    modelVersion: XNAV_MODEL_VERSION,
    gates: [ageGate, poolGate],
  });
}

/**
 * Computes NAV twice — simulating two independent surfaces reading the same
 * roster on the same day — and checks every player's snapshot id agrees
 * between them. This is the real determinism guarantee DATA-02 promises,
 * exercised against live data rather than only a fixture.
 */
function buildValuationDomain(
  players: Asset[],
  capCeiling: number | null | undefined,
  generatedAt: string | null,
): DomainManifest {
  const asOf = snapshotDate();
  const surfaceA = players.map((p) => calculateAssetNAV(p, capCeiling ?? undefined, asOf));
  const surfaceB = players.map((p) => calculateAssetNAV(p, capCeiling ?? undefined, asOf));

  const reconciliationSnapshots = [
    ...surfaceA.map((r, i) => ({ playerId: players[i].id, snapshotId: r.snapshot!.snapshotId, total: r.total })),
    ...surfaceB.map((r, i) => ({ playerId: players[i].id, snapshotId: r.snapshot!.snapshotId, total: r.total })),
  ];
  const reconciliationGate = crossSurfaceValueReconciliation(reconciliationSnapshots);

  const uncertaintyGate = missingDataUncertaintyInvariant(
    surfaceA.map((r, i) => ({
      playerId: players[i].id,
      marketValue: r.snapshot?.marketValue ?? null,
      surplus: r.snapshot?.surplus ?? null,
      uncertainty: r.snapshot?.uncertainty ?? null,
    })),
  );

  return buildDomainManifest({
    domain: "valuation",
    lastSuccessfulIngest: generatedAt,
    coverage: `${players.length} player(s), model ${XNAV_MODEL_VERSION}`,
    modelVersion: XNAV_MODEL_VERSION,
    gates: [reconciliationGate, uncertaintyGate],
  });
}

function buildTeamModelDomain(players: Asset[], generatedAt: string | null): DomainManifest {
  const legalities = Object.fromEntries(
    TEAMS_DB.map((t) => [t.id, rosterLegality(players, t.id)]),
  );
  const gate = teamPopulationLineupInvariant(legalities);
  return buildDomainManifest({
    domain: "teamModel",
    lastSuccessfulIngest: generatedAt,
    coverage: `${TEAMS_DB.length} team(s)`,
    modelVersion: XNAV_MODEL_VERSION,
    gates: [gate],
  });
}

/**
 * Builds a manifest from a real, already-loaded roster snapshot — roster,
 * contracts, valuation, and teamModel are wired to live gates; stats,
 * picks, fantasy, and simulation are left unwired and read `degraded` by
 * `buildDomainManifest`'s own default, not silently `live`.
 */
export function buildLiveReleaseManifest(snapshot: LiveRosterSnapshot): ReleaseManifest {
  const { players, generatedAt, capCeiling } = snapshot;
  const skatersAndGoalies = players.filter((p) => p.position !== "Pick");

  return buildReleaseManifest(
    snapshotDate(),
    XNAV_MODEL_VERSION,
    [
      buildRosterDomain(skatersAndGoalies, generatedAt),
      buildContractsDomain(skatersAndGoalies, generatedAt),
      buildValuationDomain(skatersAndGoalies, capCeiling, generatedAt),
      buildTeamModelDomain(players, generatedAt),
    ],
  );
}
