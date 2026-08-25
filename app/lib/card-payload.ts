// ── Shareable player-card image payload ─────────────────────────────
// The browser already computes every value on the live PercentileCard
// (percentiles vs the positional field, X-NAV, gravity, roles, contract
// math). Rather than recompute any of it server-side — and risk drift —
// the client ships this flat, already-formatted payload to the card-image
// route, which is a pure renderer. The one structured piece is the slim
// gravity profile, needed to redraw the identical Spacetime lattice.

import {
  GRAVITY_V3_FIELD_DISCLAIMER,
  GRAVITY_V3_FIELD_LABEL,
  GRAVITY_V3_SITUATION_SCOPE,
  gravityV3PublicPresentation,
  type GravityProfile,
  type GravitySituationScope,
  type GravityTier,
} from "./gravity";
import type { GravityProfileV4 } from "./gravity-v4/types";
import { z } from "zod";

interface CardGravityBase {
  masses: { oz: number; nz: number; dz: number };
  force: number;
  isDefenseman: boolean;
  season: string;
  situation: GravitySituationScope;
  fieldLabel: string;
  fieldDisclaimer: string;
  gravityPercentile: number | null;
}

export interface CardGravityV3Input extends CardGravityBase {
  evidenceStatus: GravityProfile["evidenceStatus"];
  tier: GravityTier | null;
  modelVersion: "3.0";
  modelLabel: "V3 FALLBACK";
  reliabilityLabel: string;
  coverageLabel: string;
}

export interface CardGravityV4Input extends CardGravityBase {
  tier: GravityTier | null;
  modelVersion: "4.0";
  modelLabel: "V4" | "V4 DIAGNOSTIC FIXTURE";
  reliabilityLabel: string;
  coverageLabel: string;
  netXg82: number | null;
  netIntervalLabel: string | null;
  zoneXg82: { oz: number; nz: number; dz: number } | null;
}

export type CardGravityInput = CardGravityV3Input | CardGravityV4Input;

export function cardGravityFromV3(
  profile: GravityProfile,
  context: { season: string; gravityPercentile: number | null },
): CardGravityV3Input {
  const presentation = gravityV3PublicPresentation(profile);
  return {
    masses: profile.masses,
    tier: profile.tier,
    evidenceStatus: profile.evidenceStatus,
    force: profile.force,
    isDefenseman: profile.isDefenseman,
    modelVersion: "3.0",
    modelLabel: "V3 FALLBACK",
    season: context.season,
    situation: presentation.situation,
    fieldLabel: presentation.fieldLabel,
    fieldDisclaimer: presentation.fieldDisclaimer,
    reliabilityLabel: `${presentation.reliability.index} INDEX`,
    coverageLabel: `${profile.dataQuality.toUpperCase()} · ${presentation.coverage.percent}% WEIGHT`,
    gravityPercentile: profile.evidenceStatus === "QUALIFIED"
      ? context.gravityPercentile
      : null,
  };
}

const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

export function cardGravityFromV4(profile: GravityProfileV4): CardGravityV4Input {
  return {
    masses: profile.displayMasses,
    tier: profile.tier,
    force: profile.displayForce,
    isDefenseman: profile.position === "D",
    modelVersion: "4.0",
    modelLabel: profile.metadata.artifactKind === "diagnostic_fixture"
      ? "V4 DIAGNOSTIC FIXTURE"
      : "V4",
    season: profile.season,
    situation: "5V5",
    fieldLabel: GRAVITY_V3_FIELD_LABEL,
    fieldDisclaimer: "Model visualization of fitted Gravity components; not observed player-tracking data.",
    reliabilityLabel: profile.reliability,
    coverageLabel: `${profile.dataQuality.toUpperCase()} · NZ ${profile.transitionDataQuality.toUpperCase()}`,
    gravityPercentile: profile.positionPercentile,
    netXg82: profile.netXg82,
    netIntervalLabel: profile.netInterval
      ? `${signed(profile.netInterval.low)} TO ${signed(profile.netInterval.high)}`
      : null,
    zoneXg82: {
      oz: profile.zones.oz.xg82,
      nz: profile.zones.nz.xg82,
      dz: profile.zones.dz.xg82,
    },
  };
}

export interface CardStatRow {
  label: string;
  pct: number | null; // null → "No data" (never a faked 50th)
  formatted: string;
  median: string;
  barColor: string | null;
}

export interface CardImagePayload {
  name: string;
  sub: string; // "Team · POS · Age NN"
  roleLabel?: string;
  roleColor?: string;
  xnavTotal: number;
  /** Optional only so a stale pre-QW-01 browser payload remains renderable. */
  navLabel?: "X-NAV" | "G-NAV";
  navLongLabel?: string;

  // Contract strip
  capHitLabel: string;
  yearsLabel: string;
  fmvLabel: string;
  surplusLabel: string; // e.g. "+$1.7M · BARGAIN"
  surplusColor: string;

  // Gravity (null for goalies)
  gravity: CardGravityInput | null;

  edgeCells: { label: string; val: string; color?: string }[];
  stats: CardStatRow[];
  navCells: { label: string; val: number }[];

  peerLabel: string; // "all forwards"
  avgPercentile: number | null;

  // NOTE: there is deliberately no headshot field here.
  //
  // The policy is asymmetric on purpose. The site may hotlink NHL headshots —
  // that displays the league's image from the league's own server, in context.
  // The exported PNG may not: baking a copy into a branded file built to be
  // downloaded and shared is redistribution, and travelling is the whole point
  // of the card. So the renderer draws `PlayerAvatar` instead.
  //
  // `headshotDataUrl` used to live here, carrying a proxied headshot inlined as
  // a data URL. The schema below still ACCEPTS that key so a browser running
  // pre-change JS doesn't get its export rejected by `.strict()`, but nothing
  // reads it and it must never be added back to this type.
}

const gravityTierSchema = z.enum([
  "SUPERMASSIVE",
  "STAR",
  "MAIN_SEQUENCE",
  "SATELLITE",
  "ASTEROID",
  "BLACK_HOLE",
]);

const finiteBoundedMass = z.number().finite().min(-1).max(1);
const percentileSchema = z.number().finite().min(0).max(100).nullable();

const publicGravityV3Schema = z.object({
  masses: z.object({
    oz: finiteBoundedMass,
    nz: finiteBoundedMass,
    dz: finiteBoundedMass,
  }).strict(),
  evidenceStatus: z.enum(["QUALIFIED", "INSUFFICIENT"]),
  tier: gravityTierSchema.nullable(),
  force: finiteBoundedMass,
  isDefenseman: z.boolean(),
  modelVersion: z.literal("3.0"),
  modelLabel: z.literal("V3 FALLBACK"),
  season: z.string().min(1),
  situation: z.literal(GRAVITY_V3_SITUATION_SCOPE),
  reliabilityLabel: z.string().regex(/^(?:100|[1-9]?\d) INDEX$/),
  coverageLabel: z.string().regex(/^(?:FULL|PARTIAL) · (?:100|[1-9]?\d)% WEIGHT$/),
  gravityPercentile: percentileSchema,
  fieldLabel: z.literal(GRAVITY_V3_FIELD_LABEL),
  fieldDisclaimer: z.literal(GRAVITY_V3_FIELD_DISCLAIMER),
}).strict().superRefine((gravity, context) => {
  if (gravity.evidenceStatus === "INSUFFICIENT") {
    if (gravity.tier !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tier"],
        message: "Insufficient Gravity evidence cannot carry a tier.",
      });
    }
    if (gravity.gravityPercentile !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gravityPercentile"],
        message: "Insufficient Gravity evidence cannot carry a percentile.",
      });
    }
  } else if (gravity.tier === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tier"],
      message: "Qualified Gravity evidence requires a tier.",
    });
  }
});

const publicCardImagePayloadSchema = z.object({
  name: z.string().min(1),
  sub: z.string(),
  roleLabel: z.string().optional(),
  roleColor: z.string().optional(),
  xnavTotal: z.number().finite(),
  navLabel: z.enum(["X-NAV", "G-NAV"]).optional(),
  navLongLabel: z.string().min(1).optional(),
  capHitLabel: z.string(),
  yearsLabel: z.string(),
  fmvLabel: z.string(),
  surplusLabel: z.string(),
  surplusColor: z.string(),
  gravity: publicGravityV3Schema.nullable(),
  edgeCells: z.array(z.object({
    label: z.string(),
    val: z.string(),
    color: z.string().optional(),
  }).strict()),
  stats: z.array(z.object({
    label: z.string(),
    pct: percentileSchema,
    formatted: z.string(),
    median: z.string(),
    barColor: z.string().nullable(),
  }).strict()),
  navCells: z.array(z.object({
    label: z.string(),
    val: z.number().finite(),
  }).strict()),
  peerLabel: z.string(),
  avgPercentile: percentileSchema,
  // Accepted and ignored — see the note on CardImagePayload. Kept only so a
  // stale client bundle still sending it isn't rejected by `.strict()`.
  headshotDataUrl: z.string().nullable().optional(),
}).strict();

export type PublicCardPayloadValidation =
  | { success: true; data: CardImagePayload }
  | {
      success: false;
      code: "INVALID_PAYLOAD" | "UNTRUSTED_GRAVITY_V4";
      message: string;
    };

/**
 * The public image endpoint accepts only the production v3 card contract.
 * A future v4 export must resolve a validated fitted profile server-side;
 * caller-supplied v4 analytical values are never renderable here.
 */
export function validatePublicCardImagePayload(
  input: unknown,
): PublicCardPayloadValidation {
  const gravity = input && typeof input === "object"
    ? (input as Record<string, unknown>).gravity
    : null;
  if (
    gravity
    && typeof gravity === "object"
    && (gravity as Record<string, unknown>).modelVersion === "4.0"
  ) {
    return {
      success: false,
      code: "UNTRUSTED_GRAVITY_V4",
      message: "Gravity v4 cards must be resolved server-side from a validated fitted profile.",
    };
  }

  const parsed = publicCardImagePayloadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_PAYLOAD",
      message: "Invalid public card payload.",
    };
  }
  // Tolerated on the way in, dropped before the renderer can see it. Leaving
  // it on the validated object would mean the policy held only for as long as
  // nobody wrote `data.headshotDataUrl` — this makes it unavailable instead.
  const { headshotDataUrl: _discarded, ...data } = parsed.data;
  return { success: true, data };
}
