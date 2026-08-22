import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import diagnosticArtifact from "@/app/lib/gravity-v4/fixtures/diagnostic-artifact.json";
import {
  deriveGravityV4Display,
  gravityDisplayValue,
} from "@/app/lib/gravity-v4/display";
import { isGravityV4Enabled } from "@/app/lib/gravity-v4/feature-flag";
import { loadGravityProfileV4 } from "@/app/lib/gravity-v4/load-profile";
import type {
  GravityProfileV4,
  GravityV4ArtifactEnvelope,
} from "@/app/lib/gravity-v4/types";
import { validateGravityProfileV4 } from "@/app/lib/gravity-v4/validate-profile";
import { cardGravityFromV4 } from "@/app/lib/card-payload";

function fittedProfile(): GravityProfileV4 {
  const display = deriveGravityV4Display(
    { ozXg82: 3, nzXg82: 2, dzXg82: 1 },
    { zoneXg82: 5, netXg82: 8 },
  );
  return {
    playerId: "8478402",
    playerName: "Fixture Player",
    position: "C",
    season: "2025-26",
    zones: {
      oz: {
        xg60: 0.15,
        xg82: 3,
        interval: { low: 1, high: 5, level: 0.9 },
        positionPercentile: 90,
        leaguePercentile: 88,
        dataQuality: "full",
        sampleMinutes: 700,
      },
      nz: {
        xg60: 0.1,
        xg82: 2,
        interval: { low: 0.5, high: 3.5, level: 0.9 },
        positionPercentile: 82,
        leaguePercentile: 80,
        dataQuality: "proxy",
        sampleMinutes: 700,
      },
      dz: {
        xg60: 0.05,
        xg82: 1,
        interval: { low: -0.2, high: 2.2, level: 0.9 },
        positionPercentile: 70,
        leaguePercentile: 68,
        dataQuality: "full",
        sampleMinutes: 700,
      },
    },
    netXg60: 0.3,
    netXg82: 6,
    netInterval: { low: 2, high: 9, level: 0.9 },
    positionPercentile: 91,
    leaguePercentile: 89,
    seasonContributionXg: 5.1,
    ...display,
    tier: "STAR",
    reliability: "HIGH",
    portability: null,
    portabilityLabel: "UNKNOWN",
    transitionDataQuality: "proxy",
    dataQuality: "partial",
    metadata: {
      modelVersion: "4.0",
      trainedAt: "2026-07-20T00:00:00.000Z",
      trainingSeasons: ["2023-24", "2024-25"],
      targetSeason: "2025-26",
      strengthState: "5v5",
      sourceVersion: "unit-test-source-v1",
      artifactKind: "fitted",
      visualScales: { zoneXg82: 5, netXg82: 8 },
    },
  };
}

function artifact(profile = fittedProfile()): GravityV4ArtifactEnvelope {
  return {
    schemaVersion: "gravity-v4-profile-set/1",
    artifactKind: "fitted",
    generatedAt: "2026-07-21T00:00:00.000Z",
    profiles: [profile],
  };
}

describe("Gravity v4 display and validation", () => {
  it("keeps analytical values unbounded while display transforms remain bounded", () => {
    const analytical = 30;
    const display = gravityDisplayValue(analytical, 5);

    expect(analytical).toBeGreaterThan(1);
    expect(Math.abs(display)).toBeLessThan(1);
  });

  it("accepts a profile whose net is the unweighted zone sum and positive DZ means prevention", () => {
    const profile = fittedProfile();
    const result = validateGravityProfileV4(profile);

    expect(result.ok).toBe(true);
    expect(profile.netXg82).toBe(
      profile.zones.oz.xg82 + profile.zones.nz.xg82 + profile.zones.dz.xg82,
    );
    expect(profile.zones.dz.xg82).toBeGreaterThan(0);
  });

  it("rejects weighted or otherwise inconsistent net values", () => {
    const profile = { ...fittedProfile(), netXg82: 5.4 };
    const result = validateGravityProfileV4(profile);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some(issue => issue.path === "netXg82")).toBe(true);
    }
  });

  it("does not permit an insufficient sample to receive a tier", () => {
    const profile = fittedProfile();
    profile.zones.nz = {
      ...profile.zones.nz,
      sampleMinutes: 100,
      dataQuality: "insufficient",
    };
    profile.transitionDataQuality = "missing";
    profile.reliability = "INSUFFICIENT";
    profile.dataQuality = "insufficient";

    const result = validateGravityProfileV4(profile);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some(issue => issue.path === "tier")).toBe(true);
    }
  });

  it("requires intervals for qualified fitted profiles", () => {
    const profile = { ...fittedProfile(), netInterval: null };
    const result = validateGravityProfileV4(profile);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some(issue => issue.path === "netInterval")).toBe(true);
    }
  });
});

describe("Gravity v4 runtime loader and feature flag", () => {
  it("is env-gated now that the release lock is open (OZ+DZ untiered)", () => {
    expect(isGravityV4Enabled({})).toBe(false);
    expect(isGravityV4Enabled({ GRAVITY_V4_ENABLED: "false" })).toBe(false);
    expect(isGravityV4Enabled({ GRAVITY_V4_ENABLED: "true" })).toBe(true);
  });

  it("loads a fitted profile by stable ID and exact season", () => {
    const result = loadGravityProfileV4({
      playerId: "8478402",
      season: "2025-26",
      position: "C",
      artifact: artifact(),
      enabled: true,
    });

    expect(result.status).toBe("ready");
    expect(result.profile?.metadata.modelVersion).toBe("4.0");
  });

  it("rejects season/model mismatches and marks absent profiles as missing", () => {
    const mismatch = loadGravityProfileV4({
      playerId: "8478402",
      season: "2026-27",
      position: "C",
      artifact: artifact(),
      enabled: true,
    });
    const missing = loadGravityProfileV4({
      playerId: "8479999",
      season: "2025-26",
      position: "D",
      artifact: artifact(),
      enabled: true,
    });
    const profile = fittedProfile();
    const modelMismatch = loadGravityProfileV4({
      playerId: "8478402",
      season: "2025-26",
      position: "C",
      artifact: {
        ...artifact(),
        profiles: [{
          ...profile,
          metadata: { ...profile.metadata, modelVersion: "4.1" },
        }],
      },
      enabled: true,
    });

    expect(mismatch.status).toBe("profile_invalid");
    expect(modelMismatch.status).toBe("profile_invalid");
    expect(missing.status).toBe("profile_missing");
    expect(missing.profile).toBeNull();
  });

  it("returns no v4 profile for goalies or draft picks", () => {
    for (const position of ["G", "Pick"]) {
      const result = loadGravityProfileV4({
        playerId: "8478402",
        season: "2025-26",
        position,
        artifact: artifact(),
        enabled: true,
      });
      expect(result.status).toBe("ineligible");
      expect(result.profile).toBeNull();
    }
  });

  it("allows the zero-value fixture only on an explicit diagnostic path", () => {
    const publicLookup = loadGravityProfileV4({
      playerId: "9999999",
      season: "2025-26",
      position: "W",
      artifact: diagnosticArtifact,
      enabled: true,
    });
    const diagnosticLookup = loadGravityProfileV4({
      playerId: "9999999",
      season: "2025-26",
      position: "W",
      artifact: diagnosticArtifact,
      enabled: true,
      allowDiagnosticFixture: true,
    });

    expect(publicLookup.status).toBe("artifact_invalid");
    expect(diagnosticLookup.status).toBe("ready");
    expect(diagnosticLookup.profile?.metadata.trainedAt).toBeNull();
    expect(diagnosticLookup.profile?.netXg82).toBe(0);
  });

  it("rejects a diagnostic fixture that claims a fitted estimate", () => {
    const profile = diagnosticArtifact.profiles[0];
    const misleadingDiagnostic = {
      ...profile,
      reliability: "LOW",
    };
    const result = validateGravityProfileV4(misleadingDiagnostic, {
      allowDiagnosticFixture: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some(issue =>
        issue.message.includes("cannot claim fitted estimates"),
      )).toBe(true);
    }
  });
});

describe("Gravity v4 diagnostic integrations", () => {
  it("maps a validated profile into the shared card contract without changing analytics", () => {
    const profile = fittedProfile();
    const card = cardGravityFromV4(profile);

    expect(card.modelVersion).toBe("4.0");
    expect(card.netXg82).toBe(profile.netXg82);
    expect(card.force).toBe(profile.displayForce);
    expect(card.zoneXg82?.dz).toBe(profile.zones.dz.xg82);
  });

  it("wires the player and card renderers while keeping X-NAV v4-free", () => {
    const root = process.cwd();
    const playerPage = readFileSync(`${root}/app/players/[playerId]/page.tsx`, "utf8");
    const cardRoute = readFileSync(`${root}/app/api/card-image/route.tsx`, "utf8");
    const xnav = readFileSync(`${root}/app/lib/xnav-engine.ts`, "utf8");
    const simulator = readFileSync(`${root}/app/api/simulate/route.ts`, "utf8");

    expect(playerPage).toContain("loadGravityProfileV4");
    expect(playerPage).toContain("<GravityFieldV4");
    expect(cardRoute).toContain("MODELLED FIELD · POSITION-RELATIVE");
    expect(cardRoute).toContain("data.gravity.netXg82");
    expect(xnav).not.toContain('from "@/app/lib/gravity-v4');
    expect(simulator).not.toContain('from "@/app/lib/gravity-v4');
  });

  it("keeps public terminology consistent with the Release A claims", () => {
    const root = process.cwd();
    const field = readFileSync(`${root}/app/components/GravityField.tsx`, "utf8");
    const methodology = readFileSync(`${root}/app/methodology/page.tsx`, "utf8");
    const glossary = readFileSync(`${root}/app/glossary/page.tsx`, "utf8");

    expect(field).toContain("V3 Fallback");
    expect(field).toContain("Reliability");
    expect(field).toContain("Signal Stability");
    expect(field).not.toContain("Partner Indep.");
    expect(methodology).not.toContain("defenders overcommit");
    expect(methodology).toContain("not a literal tracking map");
    expect(glossary).toContain("not an observed player-tracking heatmap");
  });
});
