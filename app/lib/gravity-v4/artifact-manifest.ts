import { createHash } from "crypto";

/**
 * Pinned identity of the committed fitted artifact. A changed artifact must
 * never be accepted silently: the loader (`load-profile.ts`) refuses any
 * artifact whose SHA-256 does not match this manifest, so regenerating
 * `fitted-artifact.json` without updating this file fails closed, and a test
 * (`__tests__/gravity-v4-release-evidence.test.ts`) fails if the file on disk
 * and the manifest disagree. Update both together, deliberately, with the
 * evidence recorded in docs/analytics/GRAVITY_V4_RELEASE_EVIDENCE.md.
 *
 * The hash is over the exact bytes `scripts/gravity-v4/export-profiles.ts`
 * writes (`JSON.stringify(envelope, null, 2) + "\n"`), so it equals
 * `sha256sum app/lib/gravity-v4/fitted-artifact.json`.
 */
export interface GravityV4ArtifactManifest {
  sha256: string;
  schemaVersion: "gravity-v4-profile-set/1";
  artifactKind: "fitted";
  profileCount: number;
  generatedAt: string;
  trainedAt: string;
  sourceVersion: string;
  targetSeason: string;
  /** Zones carrying fitted estimates in every profile. */
  zonesFitted: readonly ["oz", "dz"];
  /** Zones with no estimate — always `dataQuality: "insufficient"`, never a value. */
  zonesUnavailable: readonly ["nz"];
}

export const GRAVITY_V4_ARTIFACT_MANIFEST: GravityV4ArtifactManifest = {
  sha256: "6de0271ef80f0969185e4217604efa332f1a94e7a1144d586a18ede05e74e29f",
  schemaVersion: "gravity-v4-profile-set/1",
  artifactKind: "fitted",
  profileCount: 560,
  generatedAt: "2026-08-22T16:39:29.669Z",
  trainedAt: "2026-08-22T16:39:29.616Z",
  sourceVersion: "capandcrease/oz-dz@20252026",
  targetSeason: "2025-26",
  zonesFitted: ["oz", "dz"],
  zonesUnavailable: ["nz"],
};

/** Canonical bytes of an artifact — the exact form the exporter writes. */
export function serializeGravityV4Artifact(artifact: unknown): string {
  return JSON.stringify(artifact, null, 2) + "\n";
}

const hashCache = new WeakMap<object, string>();

export function hashGravityV4Artifact(artifact: unknown): string {
  const cacheable = typeof artifact === "object" && artifact !== null;
  if (cacheable) {
    const hit = hashCache.get(artifact as object);
    if (hit) return hit;
  }
  const digest = createHash("sha256").update(serializeGravityV4Artifact(artifact)).digest("hex");
  if (cacheable) hashCache.set(artifact as object, digest);
  return digest;
}

export interface GravityV4ArtifactVerification {
  ok: boolean;
  sha256: string;
  expected: string;
  profileCount: number | null;
  issues: Array<{ path: string; message: string }>;
}

/**
 * Compare an in-memory artifact against the pinned manifest. Pure and
 * memoised per object, so calling it on every profile lookup costs one hash
 * per process, not one per request.
 */
export function verifyGravityV4Artifact(
  artifact: unknown,
  manifest: GravityV4ArtifactManifest = GRAVITY_V4_ARTIFACT_MANIFEST,
): GravityV4ArtifactVerification {
  const sha256 = hashGravityV4Artifact(artifact);
  const issues: GravityV4ArtifactVerification["issues"] = [];
  const profiles = typeof artifact === "object" && artifact !== null
    ? (artifact as { profiles?: unknown }).profiles
    : undefined;
  const profileCount = Array.isArray(profiles) ? profiles.length : null;
  if (sha256 !== manifest.sha256) {
    issues.push({ path: "sha256", message: "Artifact checksum does not match the pinned manifest." });
  }
  if (profileCount !== manifest.profileCount) {
    issues.push({ path: "profiles", message: `Artifact carries ${profileCount ?? "no"} profiles; manifest pins ${manifest.profileCount}.` });
  }
  return { ok: issues.length === 0, sha256, expected: manifest.sha256, profileCount, issues };
}
