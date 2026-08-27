// ── release-manifest.ts ──────────────────────────────────────────
//
// DATA-06: a signed/versioned snapshot manifest naming, per domain — roster,
// stats, contracts, valuation, picks, team model, fantasy, simulation fit —
// the last successful ingest, coverage, model version, reconciliation
// status, and warnings. The point of keeping domains separate is the
// ticket's own acceptance line: "a failed domain can be diagnosed without
// marking the whole product Live." One lumped boolean (which is what
// `LeagueProvenance.reconciliation` in data-context.ts still is) cannot say
// that; a stale Fantasy projection should never read as a broken roster.
//
// This module does not fetch anything — it is the shape a manifest takes
// and the rule for composing one from a domain's gate results. Wiring every
// one of the eight domains to a live ingest signal is follow-up work; what
// is here is real and used today wherever a caller has gate results to
// report (see release-gates.ts).

import type { GateResult } from "@/app/lib/release-gates";

export const RELEASE_MANIFEST_DOMAINS = [
  "roster", "stats", "contracts", "valuation", "picks",
  "teamModel", "fantasy", "simulation",
] as const;
export type ManifestDomain = (typeof RELEASE_MANIFEST_DOMAINS)[number];

export type DomainStatus = "live" | "degraded" | "down";

export interface DomainManifest {
  domain: ManifestDomain;
  /** ISO timestamp of the last ingest that actually completed, or null if none is known. */
  lastSuccessfulIngest: string | null;
  /** Free-text population/coverage description — see data-context.ts's `coverage` for the existing convention. */
  coverage: string;
  modelVersion: string;
  status: DomainStatus;
  warnings: string[];
  gates: GateResult[];
}

export interface ReleaseManifest {
  /** Calendar date the manifest was struck — see valuation-snapshot.ts's `snapshotDate`. */
  snapshotDate: string;
  modelVersion: string;
  generatedAt: string;
  domains: Partial<Record<ManifestDomain, DomainManifest>>;
}

/**
 * A domain is `down` when a gate that actually ran failed; `degraded` when
 * every gate passed but a warning (a stale ingest, thin coverage) still
 * applies; `live` only when nothing is wrong. Passing no gates at all is
 * NOT `live` — an unchecked domain has no evidence behind that claim, so it
 * reads as `degraded` with a warning saying so, never asserted as healthy
 * by default.
 */
export function buildDomainManifest(input: {
  domain: ManifestDomain;
  lastSuccessfulIngest: string | null;
  coverage: string;
  modelVersion: string;
  gates: GateResult[];
  warnings?: string[];
}): DomainManifest {
  const warnings = [...(input.warnings ?? [])];
  const failedGates = input.gates.filter((g) => !g.passed);
  if (input.gates.length === 0) {
    warnings.push("No release gates ran for this domain — status is unverified, not confirmed healthy.");
  }

  const status: DomainStatus =
    failedGates.length > 0 ? "down"
    : input.gates.length === 0 || warnings.length > 0 ? "degraded"
    : "live";

  return {
    domain: input.domain,
    lastSuccessfulIngest: input.lastSuccessfulIngest,
    coverage: input.coverage,
    modelVersion: input.modelVersion,
    status,
    warnings,
    gates: input.gates,
  };
}

export function buildReleaseManifest(
  snapshotDate: string,
  modelVersion: string,
  domains: DomainManifest[],
  generatedAt: string = new Date().toISOString(),
): ReleaseManifest {
  const byDomain: Partial<Record<ManifestDomain, DomainManifest>> = {};
  for (const d of domains) byDomain[d.domain] = d;
  return { snapshotDate, modelVersion, generatedAt, domains: byDomain };
}

/**
 * "All downstream caches invalidate by snapshotDate + modelVersion." A
 * cache key built through this can never silently serve a payload struck
 * under a different model version or an earlier day's snapshot — the key
 * itself changes, so the old entry is simply never looked up again rather
 * than needing an explicit bust. See team-cache.ts's `teamCacheKey` for the
 * existing parameterized-key pattern this extends.
 */
export function manifestCacheKey(baseKey: string, snapshotDate: string, modelVersion: string): string {
  const versionSlug = modelVersion.replace(/\s+/g, "-").toLowerCase();
  return `${baseKey}:snap:${snapshotDate}:model:${versionSlug}`;
}

/** Whether every domain present in the manifest is at least usable (not `down`). */
export function manifestIsPublishable(manifest: ReleaseManifest): boolean {
  return Object.values(manifest.domains).every((d) => d && d.status !== "down");
}

/** Domains that are `down`, for a diagnosis that does not require reading every field. */
export function failedDomains(manifest: ReleaseManifest): ManifestDomain[] {
  return (Object.values(manifest.domains) as DomainManifest[])
    .filter((d) => d.status === "down")
    .map((d) => d.domain);
}
