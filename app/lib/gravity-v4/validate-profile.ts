import { z } from "zod";
import { gravityDisplayValue } from "./display";
import type {
  GravityProfileV4,
  GravityV4ArtifactEnvelope,
} from "./types";

const dataQualitySchema = z.enum(["full", "proxy", "partial", "insufficient"]);
const reliabilitySchema = z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]);
const artifactKindSchema = z.enum(["fitted", "diagnostic_fixture"]);
const tierSchema = z.enum([
  "SUPERMASSIVE",
  "STAR",
  "MAIN_SEQUENCE",
  "SATELLITE",
  "ASTEROID",
  "BLACK_HOLE",
]);

const intervalSchema = z.object({
  low: z.number().finite(),
  high: z.number().finite(),
  level: z.literal(0.9),
}).strict().superRefine((interval, ctx) => {
  if (interval.low > interval.high) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["low"],
      message: "Interval low must not exceed interval high.",
    });
  }
});

const percentileSchema = z.number().finite().min(0).max(100).nullable();

const zoneEstimateSchema = z.object({
  xg60: z.number().finite(),
  xg82: z.number().finite(),
  interval: intervalSchema.nullable(),
  positionPercentile: percentileSchema,
  leaguePercentile: percentileSchema,
  dataQuality: dataQualitySchema,
  sampleMinutes: z.number().finite().nonnegative(),
}).strict();

const metadataSchema = z.object({
  modelVersion: z.literal("4.0"),
  trainedAt: z.string().datetime().nullable(),
  trainingSeasons: z.array(z.string().min(1)),
  targetSeason: z.string().min(1),
  strengthState: z.literal("5v5"),
  sourceVersion: z.string().min(1),
  artifactKind: artifactKindSchema,
  visualScales: z.object({
    zoneXg82: z.number().finite().positive(),
    netXg82: z.number().finite().positive(),
  }).strict(),
}).strict();

const profileSchema = z.object({
  playerId: z.string().regex(/^\d+$/, "A stable numeric NHL player ID is required."),
  playerName: z.string().min(1),
  position: z.enum(["C", "W", "D"]),
  season: z.string().min(1),
  zones: z.object({
    oz: zoneEstimateSchema,
    nz: zoneEstimateSchema,
    dz: zoneEstimateSchema,
  }).strict(),
  netXg60: z.number().finite(),
  netXg82: z.number().finite(),
  netInterval: intervalSchema.nullable(),
  positionPercentile: percentileSchema,
  leaguePercentile: percentileSchema,
  seasonContributionXg: z.number().finite(),
  displayForce: z.number().finite().min(-1).max(1),
  displayMasses: z.object({
    oz: z.number().finite().min(-1).max(1),
    nz: z.number().finite().min(-1).max(1),
    dz: z.number().finite().min(-1).max(1),
  }).strict(),
  tier: tierSchema.nullable(),
  reliability: reliabilitySchema,
  portability: z.number().finite().min(0).max(1).nullable(),
  portabilityLabel: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
  transitionDataQuality: z.enum(["event", "proxy", "missing"]),
  dataQuality: dataQualitySchema,
  metadata: metadataSchema,
}).strict().superRefine((profile, ctx) => {
  const expectedNet82 = profile.zones.oz.xg82 + profile.zones.nz.xg82 + profile.zones.dz.xg82;
  const expectedNet60 = profile.zones.oz.xg60 + profile.zones.nz.xg60 + profile.zones.dz.xg60;
  if (Math.abs(profile.netXg82 - expectedNet82) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["netXg82"],
      message: "netXg82 must be the unweighted sum of OZ, NZ, and DZ xG/82.",
    });
  }
  if (Math.abs(profile.netXg60 - expectedNet60) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["netXg60"],
      message: "netXg60 must be the unweighted sum of OZ, NZ, and DZ xG/60.",
    });
  }
  if (profile.season !== profile.metadata.targetSeason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["season"],
      message: "Profile season must match metadata.targetSeason.",
    });
  }

  const expectedForce = gravityDisplayValue(
    profile.netXg82,
    profile.metadata.visualScales.netXg82,
  );
  const expectedMasses = {
    oz: gravityDisplayValue(profile.zones.oz.xg82, profile.metadata.visualScales.zoneXg82),
    nz: gravityDisplayValue(profile.zones.nz.xg82, profile.metadata.visualScales.zoneXg82),
    dz: gravityDisplayValue(profile.zones.dz.xg82, profile.metadata.visualScales.zoneXg82),
  };
  if (Math.abs(profile.displayForce - expectedForce) > 0.001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["displayForce"],
      message: "displayForce must be derived from netXg82 and the stored visual scale.",
    });
  }
  for (const zone of ["oz", "nz", "dz"] as const) {
    if (Math.abs(profile.displayMasses[zone] - expectedMasses[zone]) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["displayMasses", zone],
        message: `${zone.toUpperCase()} display mass must be derived from analytical xG/82.`,
      });
    }
  }

  const minimumMinutes = Math.min(
    profile.zones.oz.sampleMinutes,
    profile.zones.nz.sampleMinutes,
    profile.zones.dz.sampleMinutes,
  );
  const insufficient = minimumMinutes < 150
    || profile.dataQuality === "insufficient"
    || profile.reliability === "INSUFFICIENT";
  if (insufficient && profile.tier !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tier"],
      message: "Insufficient profiles must not receive a public tier.",
    });
  }

  if (profile.portability === null && profile.portabilityLabel !== "UNKNOWN") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["portabilityLabel"],
      message: "Missing portability must be labelled UNKNOWN.",
    });
  }
  if (profile.portability !== null && profile.portabilityLabel === "UNKNOWN") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["portabilityLabel"],
      message: "A fitted portability value requires a non-UNKNOWN label.",
    });
  }

  if (profile.transitionDataQuality === "missing"
      && profile.zones.nz.dataQuality !== "insufficient") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["zones", "nz", "dataQuality"],
      message: "Missing transition data must mark the NZ estimate insufficient.",
    });
  }
  if (profile.transitionDataQuality === "proxy"
      && !["proxy", "partial"].includes(profile.zones.nz.dataQuality)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["zones", "nz", "dataQuality"],
      message: "Proxy transition data must remain visibly proxy-based.",
    });
  }

  if (profile.metadata.artifactKind === "diagnostic_fixture") {
    if (profile.metadata.trainedAt !== null || profile.metadata.trainingSeasons.length !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metadata"],
        message: "A diagnostic fixture cannot claim a training date or training seasons.",
      });
    }
    const diagnosticValues = [
      profile.zones.oz.xg60,
      profile.zones.oz.xg82,
      profile.zones.nz.xg60,
      profile.zones.nz.xg82,
      profile.zones.dz.xg60,
      profile.zones.dz.xg82,
      profile.netXg60,
      profile.netXg82,
      profile.seasonContributionXg,
      profile.displayForce,
      profile.displayMasses.oz,
      profile.displayMasses.nz,
      profile.displayMasses.dz,
    ];
    const claimsEstimate = diagnosticValues.some(value => value !== 0)
      || profile.tier !== null
      || profile.netInterval !== null
      || profile.positionPercentile !== null
      || profile.leaguePercentile !== null
      || profile.portability !== null
      || profile.portabilityLabel !== "UNKNOWN"
      || profile.reliability !== "INSUFFICIENT"
      || profile.dataQuality !== "insufficient"
      || profile.transitionDataQuality !== "missing"
      || Object.values(profile.zones).some(zone =>
        zone.interval !== null
        || zone.positionPercentile !== null
        || zone.leaguePercentile !== null
        || zone.dataQuality !== "insufficient"
        || zone.sampleMinutes !== 0
      );
    if (claimsEstimate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metadata", "artifactKind"],
        message: "Diagnostic fixtures must remain zero-valued and cannot claim fitted estimates.",
      });
    }
  } else if (profile.metadata.trainedAt === null || profile.metadata.trainingSeasons.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["metadata"],
      message: "A fitted artifact requires training provenance.",
    });
  } else if (!insufficient && (
    profile.netInterval === null
    || Object.values(profile.zones).some(zone => zone.interval === null)
  )) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["netInterval"],
      message: "A qualified fitted profile requires 90% zone and net intervals.",
    });
  }
});

const artifactEnvelopeSchema = z.object({
  schemaVersion: z.literal("gravity-v4-profile-set/1"),
  artifactKind: artifactKindSchema,
  generatedAt: z.string().datetime(),
  profiles: z.array(z.unknown()),
}).strict();

export interface GravityValidationIssue {
  path: string;
  message: string;
}

export type GravityProfileValidationResult =
  | { ok: true; profile: GravityProfileV4; issues: [] }
  | { ok: false; profile: null; issues: GravityValidationIssue[] };

function issuesFromZod(error: z.ZodError): GravityValidationIssue[] {
  return error.issues.map(issue => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function validateGravityProfileV4(
  input: unknown,
  expected: {
    playerId?: string;
    season?: string;
    allowDiagnosticFixture?: boolean;
  } = {},
): GravityProfileValidationResult {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, profile: null, issues: issuesFromZod(parsed.error) };
  }

  const issues: GravityValidationIssue[] = [];
  if (expected.playerId !== undefined && parsed.data.playerId !== expected.playerId) {
    issues.push({ path: "playerId", message: "Profile playerId does not match the requested player." });
  }
  if (expected.season !== undefined && parsed.data.season !== expected.season) {
    issues.push({ path: "season", message: "Profile season does not match the requested season." });
  }
  if (parsed.data.metadata.artifactKind === "diagnostic_fixture"
      && expected.allowDiagnosticFixture !== true) {
    issues.push({
      path: "metadata.artifactKind",
      message: "Diagnostic fixtures are not eligible for public model loading.",
    });
  }
  if (issues.length > 0) return { ok: false, profile: null, issues };

  return { ok: true, profile: parsed.data as GravityProfileV4, issues: [] };
}

export type GravityArtifactValidationResult =
  | { ok: true; artifact: GravityV4ArtifactEnvelope; issues: [] }
  | { ok: false; artifact: null; issues: GravityValidationIssue[] };

export function validateGravityV4ArtifactEnvelope(
  input: unknown,
  allowDiagnosticFixture = false,
): GravityArtifactValidationResult {
  const parsed = artifactEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, artifact: null, issues: issuesFromZod(parsed.error) };
  }
  if (parsed.data.artifactKind === "diagnostic_fixture" && !allowDiagnosticFixture) {
    return {
      ok: false,
      artifact: null,
      issues: [{
        path: "artifactKind",
        message: "Diagnostic fixture artifacts are restricted to explicit diagnostic paths.",
      }],
    };
  }
  return {
    ok: true,
    artifact: parsed.data as GravityV4ArtifactEnvelope,
    issues: [],
  };
}
