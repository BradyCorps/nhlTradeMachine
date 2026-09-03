// ── gravity-v4-release-evidence.test.ts ──────────────────────────────
//
// The release-evidence gate for the shipped OZ + DZ artifact
// (docs/analytics/GRAVITY_V4_RELEASE_EVIDENCE.md). Every claim in that
// document about the RUNTIME is pinned here: the artifact's identity, that
// every profile passes the shipped validator, that NZ is never presented as a
// value, that the flag fails closed, that a changed artifact is refused, and
// that no valuation, ranking, trade, GM, fantasy or simulation path imports
// Gravity v4 at all.

import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  GRAVITY_V4_ARTIFACT_MANIFEST,
  hashGravityV4Artifact,
  verifyGravityV4Artifact,
} from "@/app/lib/gravity-v4/artifact-manifest";
import { cardGravityFromV4 } from "@/app/lib/card-payload";
import { gravityNetScopeLabel, gravityZoneAvailable, gravityZoneXg82OrNull } from "@/app/lib/gravity-v4/display";
import { isGravityV4Enabled, GRAVITY_V4_RELEASE_READY } from "@/app/lib/gravity-v4/feature-flag";
import { loadGravityProfileV4 } from "@/app/lib/gravity-v4/load-profile";
import { GRAVITY_V4_RUNTIME_ARTIFACT, GRAVITY_V4_RUNTIME_MANIFEST } from "@/app/lib/gravity-v4/runtime-artifact";
import type { GravityProfileV4, GravityV4ArtifactEnvelope } from "@/app/lib/gravity-v4/types";
import { validateGravityProfileV4, validateGravityV4ArtifactEnvelope } from "@/app/lib/gravity-v4/validate-profile";
import { calcNAV } from "@/app/lib/xnav-engine";

const ROOT = process.cwd();
const ARTIFACT_PATH = join(ROOT, "app", "lib", "gravity-v4", "fitted-artifact.json");
const artifact = GRAVITY_V4_RUNTIME_ARTIFACT as GravityV4ArtifactEnvelope;
const profiles = artifact.profiles as GravityProfileV4[];
const SEASON = "2025-26";
const ENABLED = { GRAVITY_V4_ENABLED: "true" };

describe("Artifact identity (what is actually shipped)", () => {
  it("matches the pinned manifest: schema, kind, count, timestamps, source, checksum", () => {
    const fileSha = createHash("sha256").update(readFileSync(ARTIFACT_PATH)).digest("hex");
    expect(fileSha).toBe(GRAVITY_V4_ARTIFACT_MANIFEST.sha256);
    expect(hashGravityV4Artifact(artifact)).toBe(fileSha);
    expect(artifact.schemaVersion).toBe(GRAVITY_V4_ARTIFACT_MANIFEST.schemaVersion);
    expect(artifact.artifactKind).toBe("fitted");
    expect(artifact.generatedAt).toBe(GRAVITY_V4_ARTIFACT_MANIFEST.generatedAt);
    expect(profiles).toHaveLength(GRAVITY_V4_ARTIFACT_MANIFEST.profileCount);
    expect(profiles).toHaveLength(560);
    expect(new Set(profiles.map(p => p.playerId)).size).toBe(560);
    for (const p of profiles) {
      expect(p.season).toBe(SEASON);
      expect(p.metadata.targetSeason).toBe(SEASON);
      expect(p.metadata.trainingSeasons).toEqual([SEASON]);
      expect(p.metadata.trainedAt).toBe(GRAVITY_V4_ARTIFACT_MANIFEST.trainedAt);
      expect(p.metadata.sourceVersion).toBe(GRAVITY_V4_ARTIFACT_MANIFEST.sourceVersion);
      expect(p.metadata.strengthState).toBe("5v5");
      expect(p.metadata.modelVersion).toBe("4.0");
    }
    expect(verifyGravityV4Artifact(artifact).ok).toBe(true);
  });

  it("every one of the 560 profiles passes the shipped validator, is untiered and carries no portability", () => {
    const envelope = validateGravityV4ArtifactEnvelope(artifact);
    expect(envelope.ok).toBe(true);
    let population = { C: 0, W: 0, D: 0 };
    for (const p of profiles) {
      const v = validateGravityProfileV4(p, { playerId: p.playerId, season: SEASON });
      expect(v.ok, `${p.playerId} ${p.playerName}: ${JSON.stringify(v.issues)}`).toBe(true);
      expect(p.tier).toBeNull();
      expect(p.portability).toBeNull();
      expect(p.portabilityLabel).toBe("UNKNOWN");
      expect(["LOW", "MEDIUM"]).toContain(p.reliability);
      expect(p.dataQuality).toBe("partial");
      population[p.position] += 1;
      // OZ and DZ are fitted on the same 5v5 sample, ≥300 minutes.
      expect(p.zones.oz.dataQuality).toBe("full");
      expect(p.zones.dz.dataQuality).toBe("full");
      expect(p.zones.oz.sampleMinutes).toBe(p.zones.dz.sampleMinutes);
      expect(p.zones.oz.sampleMinutes).toBeGreaterThanOrEqual(300);
      expect(p.zones.oz.interval).not.toBeNull();
      expect(p.zones.dz.interval).not.toBeNull();
    }
    expect(population).toEqual({ C: 181, W: 181, D: 198 });
  });
});

describe("NZ is unavailable, never zero", () => {
  it("the artifact stores NZ only as an explicit placeholder, and net is OZ + DZ", () => {
    for (const p of profiles) {
      expect(p.transitionDataQuality).toBe("missing");
      expect(p.zones.nz.dataQuality).toBe("insufficient");
      expect(p.zones.nz.sampleMinutes).toBe(0);
      expect(p.zones.nz.interval).toBeNull();
      expect(p.zones.nz.positionPercentile).toBeNull();
      expect(gravityZoneAvailable(p.zones.nz)).toBe(false);
      expect(gravityZoneXg82OrNull(p.zones.nz)).toBeNull();
      expect(gravityNetScopeLabel(p)).toBe("OZ + DZ");
      expect(p.netXg82).toBeCloseTo(p.zones.oz.xg82 + p.zones.dz.xg82, 9);
      // Untiered means no net interval or net percentile is claimed either.
      expect(p.netInterval).toBeNull();
      expect(p.positionPercentile).toBeNull();
      expect(p.leaguePercentile).toBeNull();
    }
  });

  it("the card contract carries NZ as null and labels the net's scope", () => {
    const card = cardGravityFromV4(profiles[0]);
    expect(card.zoneXg82).toEqual({ oz: profiles[0].zones.oz.xg82, nz: null, dz: profiles[0].zones.dz.xg82 });
    expect(card.netScopeLabel).toBe("OZ + DZ");
    expect(card.coverageLabel).toContain("NZ MISSING");
    expect(card.tier).toBeNull();
  });

  it("the dossier panel and the share-card renderer print 'not available' rather than +0.0", () => {
    const panel = readFileSync(join(ROOT, "app", "components", "GravityFieldV4.tsx"), "utf8");
    const card = readFileSync(join(ROOT, "app", "api", "card-image", "route.tsx"), "utf8");
    expect(panel).toContain("gravityZoneAvailable");
    expect(panel).toContain('"Not available"');
    expect(panel).toContain("gravityNetScopeLabel");
    expect(card).toContain("zoneUnavailable");
    expect(card).toContain('"NOT AVAILABLE"');
    expect(card).toContain("netScopeLabel");
  });
});

describe("Fail-closed runtime", () => {
  const first = profiles[0];

  it("renders nothing with the flag unset, empty, false, or any value other than exactly true", () => {
    for (const env of [{}, { GRAVITY_V4_ENABLED: "" }, { GRAVITY_V4_ENABLED: "false" }, { GRAVITY_V4_ENABLED: "1" }, { GRAVITY_V4_ENABLED: "yes" }, { GRAVITY_V4_ENABLED: "TRUE " }]) {
      expect(isGravityV4Enabled(env)).toBe(env.GRAVITY_V4_ENABLED?.trim().toLowerCase() === "true");
      const r = loadGravityProfileV4({ playerId: first.playerId, season: SEASON, position: first.position, artifact, manifest: GRAVITY_V4_RUNTIME_MANIFEST, env });
      if (env.GRAVITY_V4_ENABLED?.trim().toLowerCase() === "true") expect(r.status).toBe("ready");
      else expect(r).toEqual({ status: "disabled", profile: null, artifactKind: null, issues: [] });
    }
    expect(GRAVITY_V4_RELEASE_READY).toBe(true);
  });

  it("loads a real profile only for the exact player, season and manifest", () => {
    const ok = loadGravityProfileV4({ playerId: first.playerId, season: SEASON, position: first.position, artifact, manifest: GRAVITY_V4_RUNTIME_MANIFEST, env: ENABLED });
    expect(ok.status).toBe("ready");
    expect(ok.profile?.playerId).toBe(first.playerId);
    expect(loadGravityProfileV4({ playerId: first.playerId, season: "2026-27", position: first.position, artifact, env: ENABLED }).status).toBe("profile_invalid");
    expect(loadGravityProfileV4({ playerId: "1", season: SEASON, position: "C", artifact, env: ENABLED }).status).toBe("profile_missing");
    expect(loadGravityProfileV4({ playerId: first.playerId, season: SEASON, position: "G", artifact, env: ENABLED }).status).toBe("ineligible");
    expect(loadGravityProfileV4({ playerId: first.playerId, season: SEASON, position: "Pick", artifact, env: ENABLED }).status).toBe("ineligible");
    expect(loadGravityProfileV4({ playerId: first.playerId, season: SEASON, artifact: null, env: ENABLED }).status).toBe("artifact_missing");
  });

  it("refuses a bad schema, a wrong kind, a diagnostic artifact on the public path, and a tampered profile", () => {
    const badSchema = { ...artifact, schemaVersion: "gravity-v4-profile-set/2" };
    expect(loadGravityProfileV4({ playerId: first.playerId, season: SEASON, artifact: badSchema, env: ENABLED }).status).toBe("artifact_invalid");
    const diagnosticKind = { ...artifact, artifactKind: "diagnostic_fixture" };
    expect(loadGravityProfileV4({ playerId: first.playerId, season: SEASON, artifact: diagnosticKind, env: ENABLED }).status).toBe("artifact_invalid");
    const kindMismatch = { ...artifact, profiles: [{ ...first, metadata: { ...first.metadata, artifactKind: "diagnostic_fixture" } }] };
    expect(loadGravityProfileV4({ playerId: first.playerId, season: SEASON, artifact: kindMismatch, env: ENABLED }).status).toBe("profile_invalid");
    const tierForged = { ...artifact, profiles: [{ ...first, tier: "STAR" }] };
    // A tier on a LOW/partial profile with no net interval is rejected by the schema's own rules.
    const forged = loadGravityProfileV4({ playerId: first.playerId, season: SEASON, artifact: tierForged, env: ENABLED });
    expect(forged.status).toBe("profile_invalid");
    const weightedNet = { ...artifact, profiles: [{ ...first, netXg82: first.netXg82 * 0.5 }] };
    expect(loadGravityProfileV4({ playerId: first.playerId, season: SEASON, artifact: weightedNet, env: ENABLED }).status).toBe("profile_invalid");
    const nzAsValue = { ...artifact, profiles: [{ ...first, zones: { ...first.zones, nz: { ...first.zones.nz, dataQuality: "full" } } }] };
    expect(loadGravityProfileV4({ playerId: first.playerId, season: SEASON, artifact: nzAsValue, env: ENABLED }).status).toBe("profile_invalid");
  });

  it("a changed artifact cannot be silently accepted: the manifest checksum refuses it", () => {
    const changed = { ...artifact, profiles: artifact.profiles.map((p, i) => i === 0 ? { ...(p as GravityProfileV4), playerName: "Someone Else" } : p) };
    expect(verifyGravityV4Artifact(changed).ok).toBe(false);
    const r = loadGravityProfileV4({ playerId: first.playerId, season: SEASON, position: first.position, artifact: changed, manifest: GRAVITY_V4_RUNTIME_MANIFEST, env: ENABLED });
    expect(r.status).toBe("artifact_invalid");
    expect(r.issues.map(i => i.path)).toContain("sha256");
    const fewer = { ...artifact, profiles: artifact.profiles.slice(1) };
    const f = loadGravityProfileV4({ playerId: profiles[1].playerId, season: SEASON, artifact: fewer, manifest: GRAVITY_V4_RUNTIME_MANIFEST, env: ENABLED });
    expect(f.status).toBe("artifact_invalid");
    expect(f.issues.map(i => i.path)).toEqual(expect.arrayContaining(["sha256", "profiles"]));
  });

  it("the player dossier passes the manifest, so the runtime path is checksum-gated", () => {
    const page = readFileSync(join(ROOT, "app", "players", "[playerId]", "page.tsx"), "utf8");
    expect(page).toContain("manifest: GRAVITY_V4_RUNTIME_MANIFEST");
  });
});

describe("Gravity v4 cannot alter any valuation, ranking, trade, GM, fantasy or simulation output", () => {
  const forbidden = /from ["'](@\/app\/lib\/gravity-v4|\.{1,2}\/(lib\/)?gravity-v4)/;
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  };

  it("no valuation, aggregation, trade, GM, fantasy, ranking or simulation module imports Gravity v4", () => {
    const valuationModules = [
      "app/lib/xnav-engine.ts", "app/lib/asset-nav.ts", "app/lib/league-nav.ts", "app/lib/team-nav-split.ts",
      "app/lib/nav-breakdown.ts", "app/lib/valuation-snapshot.ts", "app/lib/team-contention-snapshot.ts",
      "app/lib/season-snapshot.ts", "app/lib/roster-assembly.ts",
    ];
    for (const file of valuationModules) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(forbidden);
    }
    const dirs = ["app/api/simulate", "app/api/evaluate", "app/api/league", "app/api/match", "app/armchair-gm", "app/fantasy", "app/teams", "app/trade-machine"]
      .map(d => join(ROOT, d)).filter(d => { try { return statSync(d).isDirectory(); } catch { return false; } });
    for (const dir of dirs) {
      for (const file of walk(dir)) expect(readFileSync(file, "utf8"), file).not.toMatch(forbidden);
    }
  });

  it("the only runtime importers are the dossier panel, the admin diagnostic and the share-card adapter", () => {
    const importers = walk(join(ROOT, "app"))
      .filter(f => !f.includes(`${join("app", "lib", "gravity-v4")}`))
      .filter(f => forbidden.test(readFileSync(f, "utf8")))
      .map(f => f.slice(ROOT.length + 1).replace(/\\/g, "/"))
      .sort();
    expect(importers).toEqual([
      "app/api/admin/gravity-v4/route.ts",
      "app/components/GravityFieldV4.tsx",
      "app/lib/card-payload.ts",
      "app/players/[playerId]/page.tsx",
    ]);
  });

  it("the engine produces identical numbers whether or not the flag is set", () => {
    const asset = { id: "8473419", name: "Brad Marchand", position: "W" as const, age: 37, capHit: 5.25, yearsRemaining: 2, capCeiling: 104, ptsPace: 70, xGPace: 18, defRate: 0.03, avgTOI: 17, qocIndex: 60, games: 78, ops: 6, dps: 1, hasLiveStats: true };
    const before = calcNAV(asset);
    const prev = process.env.GRAVITY_V4_ENABLED;
    process.env.GRAVITY_V4_ENABLED = "true";
    try {
      expect(isGravityV4Enabled()).toBe(true);
      expect(calcNAV(asset)).toEqual(before);
    } finally {
      if (prev === undefined) delete process.env.GRAVITY_V4_ENABLED; else process.env.GRAVITY_V4_ENABLED = prev;
    }
  });
});
