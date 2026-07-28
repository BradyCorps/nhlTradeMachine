import { describe, expect, it } from "vitest";
import {
  cardGravityFromV3,
  validatePublicCardImagePayload,
  type CardImagePayload,
} from "@/app/lib/card-payload";
import {
  computeGravity,
  GRAVITY_V3_FIELD_DISCLAIMER,
  GRAVITY_V3_FIELD_LABEL,
  GRAVITY_V3_SITUATION_SCOPE,
  gravityV3PublicPresentation,
} from "@/app/lib/gravity";

function profile() {
  return computeGravity({
    id: "8478402",
    name: "Contract Test",
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
    edgeOzPct: 0.48,
    dzPct: 0.46,
    edgeSpeedMaxMph: 22.4,
    edgeBurstsOver20: 75,
    xgaRelTM: -0.2,
    dps: 1.4,
    pkTimeShare: 0.04,
    defRate: 0.08,
    capHit: 7,
    yearsRemaining: 3,
    hasNMC: false,
    hasNTC: false,
    canRetain: false,
    retainedPct: 0,
    multiplier: 1,
  })!;
}

function validCardPayload(): CardImagePayload {
  return {
    name: "Contract Test",
    sub: "Test Club · C · Age 26",
    roleLabel: "Transition Forward",
    roleColor: "#146a24",
    xnavTotal: 140,
    capHitLabel: "$7.0M",
    yearsLabel: "3 yr",
    fmvLabel: "$9.0M",
    surplusLabel: "+$2.0M · BARGAIN",
    surplusColor: "#146a24",
    gravity: cardGravityFromV3(profile(), {
      season: "2025-26",
      gravityPercentile: 88,
    }),
    edgeCells: [{ label: "Top Speed", val: "22.4 mph" }],
    stats: [{
      label: "PTS/82",
      pct: 82,
      formatted: "80.0",
      median: "50.0",
      barColor: "#146a24",
    }],
    navCells: [{ label: "OFF", val: 120 }],
    peerLabel: "all forwards",
    avgPercentile: 82,
  };
}

describe("Gravity Release A public contract", () => {
  it("uses the evidenced mixed-situation scope and public-safe terminology", () => {
    const gravity = cardGravityFromV3(profile(), {
      season: "2025-26",
      gravityPercentile: 88,
    });

    expect(gravity.situation).toBe(GRAVITY_V3_SITUATION_SCOPE);
    expect(gravity.situation).toBe("MIXED SITUATIONS");
    expect(gravity.fieldLabel).toBe(GRAVITY_V3_FIELD_LABEL);
    expect(gravity.fieldDisclaimer).toBe(GRAVITY_V3_FIELD_DISCLAIMER);
    expect(gravity.reliabilityLabel).toMatch(/^\d{1,3} INDEX$/);
    expect(gravity.reliabilityLabel).not.toMatch(/%|probab|confidence/i);
    expect(gravity).not.toHaveProperty("partnerIndependence");
    expect(gravity).not.toHaveProperty("confidence");
  });

  it("builds component presentation without exposing deprecated aliases", () => {
    const presentation = gravityV3PublicPresentation(profile());

    expect(presentation.signalStability.label).toBe("Signal Stability");
    expect(presentation.reliability.label).toBe("Reliability");
    expect(presentation.reliability.explanation).toContain("not a probability");
    expect(presentation.situation).toBe("MIXED SITUATIONS");
    expect(presentation.fieldLabel).toBe("MODELLED FIELD · POSITION-RELATIVE");
    expect(presentation.fieldDisclaimer).toBe(GRAVITY_V3_FIELD_DISCLAIMER);
    expect(presentation).not.toHaveProperty("partnerIndependence");
    expect(presentation).not.toHaveProperty("confidence");
  });

  it("accepts the legitimate v3 card payload", () => {
    const payload = validCardPayload();
    const result = validatePublicCardImagePayload(payload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(payload);
      expect(result.data.gravity?.modelVersion).toBe("3.0");
    }
  });

  it("rejects caller-supplied v4 Gravity values", () => {
    const payload = validCardPayload();
    const result = validatePublicCardImagePayload({
      ...payload,
      gravity: {
        ...payload.gravity,
        modelVersion: "4.0",
        modelLabel: "V4",
        netXg82: 99,
        zoneXg82: { oz: 33, nz: 33, dz: 33 },
      },
    });

    expect(result).toMatchObject({
      success: false,
      code: "UNTRUSTED_GRAVITY_V4",
    });
  });

  it("rejects v4 analytical fields disguised as a v3 payload", () => {
    const payload = validCardPayload();
    const result = validatePublicCardImagePayload({
      ...payload,
      gravity: {
        ...payload.gravity,
        netXg82: 99,
      },
    });

    expect(result).toMatchObject({
      success: false,
      code: "INVALID_PAYLOAD",
    });
  });

  // Policy: the site may hotlink NHL headshots; the downloadable PNG may not.
  // The card renders a drawn avatar, so no headshot ever enters the export.
  it("renders a card with no headshot field at all", () => {
    const payload = validCardPayload();
    expect(payload).not.toHaveProperty("headshotDataUrl");
    expect(validatePublicCardImagePayload(payload).success).toBe(true);
  });

  it("still accepts, and ignores, a stale client that sends one", () => {
    const result = validatePublicCardImagePayload({
      ...validCardPayload(),
      headshotDataUrl: "data:image/png;base64,AAAA",
    });

    // `.strict()` would otherwise reject the whole export for a browser
    // running pre-change JS. Accepted — but never carried into the render.
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("headshotDataUrl");
  });
});
