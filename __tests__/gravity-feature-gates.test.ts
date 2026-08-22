import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GRAVITY_V3_DISPLAY_FEATURE_FLAG,
  GRAVITY_V3_SIMULATION_FEATURE_FLAG,
  GRAVITY_V3_XNAV_FEATURE_FLAG,
  isGravityV3DisplayEnabled,
  isGravityV3SimulationEnabled,
  isGravityV3XnavEnabled,
} from "@/app/lib/gravity-feature-flags";
import {
  gravityForDisplay,
  gravityForSimulation,
  gravityForXnav,
} from "@/app/lib/gravity-channels";
import {
  GRAVITY_V4_FEATURE_FLAG,
  GRAVITY_V4_RELEASE_READY,
  isGravityV4Enabled,
} from "@/app/lib/gravity-v4/feature-flag";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import type { Asset } from "@/app/lib/trade-types";

const subject: Asset = {
  id: "gravity-gate-subject",
  name: "Gravity Gate Subject",
  teamId: "TST",
  position: "C",
  age: 26,
  games: 72,
  ptsPace: 80,
  goalsPace: 30,
  assistsPace: 50,
  xGPace: 24,
  avgTOI: 19,
  qocIndex: 70,
  xgRelTM: 7,
  baselineXgRel: 0.06,
  baselineIxg82: 20,
  ppPtsPace82: 18,
  edgeOzPct: 0.52,
  dzPct: 0.48,
  edgeSpeedMaxMph: 22.8,
  edgeBurstsOver20: 90,
  xgaRelTM: -0.4,
  dps: 2,
  pkTimeShare: 0.08,
  defRate: 0.08,
  capHit: 7,
  yearsRemaining: 3,
  hasNMC: false,
  hasNTC: false,
  canRetain: false,
  retainedPct: 0,
  multiplier: 1,
  hasLiveStats: true,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Gravity release feature flags", () => {
  it("fails every v3 public consequence closed by default", () => {
    expect(isGravityV3DisplayEnabled({})).toBe(false);
    expect(isGravityV3XnavEnabled({})).toBe(false);
    expect(isGravityV3SimulationEnabled({})).toBe(false);
  });

  it("accepts only an explicit true value for each independent channel", () => {
    const env = {
      [GRAVITY_V3_DISPLAY_FEATURE_FLAG]: " true ",
      [GRAVITY_V3_XNAV_FEATURE_FLAG]: "TRUE",
      [GRAVITY_V3_SIMULATION_FEATURE_FLAG]: "true",
    };
    expect(isGravityV3DisplayEnabled(env)).toBe(true);
    expect(isGravityV3XnavEnabled(env)).toBe(true);
    expect(isGravityV3SimulationEnabled(env)).toBe(true);

    for (const value of ["", "1", "yes", "enabled", "false"]) {
      expect(isGravityV3DisplayEnabled({ [GRAVITY_V3_DISPLAY_FEATURE_FLAG]: value })).toBe(false);
      expect(isGravityV3XnavEnabled({ [GRAVITY_V3_XNAV_FEATURE_FLAG]: value })).toBe(false);
      expect(isGravityV3SimulationEnabled({ [GRAVITY_V3_SIMULATION_FEATURE_FLAG]: value })).toBe(false);
    }
  });

  it("enabling one v3 channel cannot activate either of the others", () => {
    const displayOnly = { [GRAVITY_V3_DISPLAY_FEATURE_FLAG]: "true" };
    expect(gravityForDisplay(subject, displayOnly)).not.toBeNull();
    expect(gravityForXnav(subject, displayOnly)).toBeNull();
    expect(gravityForSimulation(subject, displayOnly)).toBe(0);

    const xnavOnly = { [GRAVITY_V3_XNAV_FEATURE_FLAG]: "true" };
    expect(gravityForDisplay(subject, xnavOnly)).toBeNull();
    expect(gravityForXnav(subject, xnavOnly)).not.toBeNull();
    expect(gravityForSimulation(subject, xnavOnly)).toBe(0);

    const simulationOnly = { [GRAVITY_V3_SIMULATION_FEATURE_FLAG]: "true" };
    expect(gravityForDisplay(subject, simulationOnly)).toBeNull();
    expect(gravityForXnav(subject, simulationOnly)).toBeNull();
    expect(gravityForSimulation(subject, simulationOnly)).not.toBe(0);
  });

  it("keeps insufficient evidence out of X-NAV and simulation when enabled", () => {
    const sparse = {
      ...subject,
      games: 60,
      xgRelTM: undefined,
      baselineXgRel: undefined,
      baselineIxg82: undefined,
      goalsPace: undefined,
      assistsPace: undefined,
      ppPtsPace82: undefined,
      edgeOzPct: undefined,
      edgeSpeedMaxMph: undefined,
      edgeBurstsOver20: undefined,
      xgaRelTM: undefined,
      dps: undefined,
      pkTimeShare: undefined,
    };
    const enabled = {
      [GRAVITY_V3_DISPLAY_FEATURE_FLAG]: "true",
      [GRAVITY_V3_XNAV_FEATURE_FLAG]: "true",
      [GRAVITY_V3_SIMULATION_FEATURE_FLAG]: "true",
    };

    expect(gravityForDisplay(sparse, enabled)?.evidenceStatus).toBe("INSUFFICIENT");
    expect(gravityForXnav(sparse, enabled)).toBeNull();
    expect(gravityForSimulation(sparse, enabled)).toBe(0);
  });

  it("keeps the public X-NAV baseline free of Gravity until its own flag is enabled", () => {
    vi.stubEnv(GRAVITY_V3_DISPLAY_FEATURE_FLAG, "true");
    vi.stubEnv(GRAVITY_V3_XNAV_FEATURE_FLAG, "false");
    const baseline = calculateAssetNAV(subject);
    expect(baseline.grav).toBe(0);
    expect(baseline.stages?.find(stage => stage.key === "grav")?.value).toBe(0);

    vi.stubEnv(GRAVITY_V3_XNAV_FEATURE_FLAG, "true");
    const enabled = calculateAssetNAV(subject);
    expect(enabled.grav).not.toBe(0);
  });

  it("opens v4 to its environment flag now the release lock is lifted", () => {
    expect(GRAVITY_V4_RELEASE_READY).toBe(true);
    expect(isGravityV4Enabled({ [GRAVITY_V4_FEATURE_FLAG]: "true" })).toBe(true);
    expect(isGravityV4Enabled({})).toBe(false);   // still dark without the flag
  });
});
