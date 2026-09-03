import { isGravityV4Enabled } from "./feature-flag";
import { verifyGravityV4Artifact, type GravityV4ArtifactManifest } from "./artifact-manifest";
import {
  validateGravityProfileV4,
  validateGravityV4ArtifactEnvelope,
  type GravityValidationIssue,
} from "./validate-profile";
import type { GravityArtifactKind, GravityProfileV4 } from "./types";

export type GravityV4LoadStatus =
  | "ready"
  | "disabled"
  | "ineligible"
  | "artifact_missing"
  | "artifact_invalid"
  | "profile_missing"
  | "profile_invalid";

export type GravityV4LoadResult =
  | {
      status: "ready";
      profile: GravityProfileV4;
      artifactKind: GravityArtifactKind;
      issues: [];
    }
  | {
      status: Exclude<GravityV4LoadStatus, "ready">;
      profile: null;
      artifactKind: GravityArtifactKind | null;
      issues: GravityValidationIssue[];
    };

export interface LoadGravityProfileV4Options {
  playerId: string;
  season: string;
  position?: string;
  artifact?: unknown;
  enabled?: boolean;
  env?: Record<string, string | undefined>;
  allowDiagnosticFixture?: boolean;
  /**
   * When supplied, the artifact must hash to this manifest before any profile
   * is read. The runtime caller always passes `GRAVITY_V4_RUNTIME_MANIFEST`;
   * diagnostic and test callers may omit it.
   */
  manifest?: GravityV4ArtifactManifest | null;
}

export function loadGravityProfileV4(
  options: LoadGravityProfileV4Options,
): GravityV4LoadResult {
  const enabled = options.enabled ?? isGravityV4Enabled(options.env);
  if (!enabled) {
    return { status: "disabled", profile: null, artifactKind: null, issues: [] };
  }
  if (options.position === "G" || options.position === "Pick") {
    return { status: "ineligible", profile: null, artifactKind: null, issues: [] };
  }
  if (options.artifact == null) {
    return { status: "artifact_missing", profile: null, artifactKind: null, issues: [] };
  }

  if (options.manifest) {
    const integrity = verifyGravityV4Artifact(options.artifact, options.manifest);
    if (!integrity.ok) {
      return {
        status: "artifact_invalid",
        profile: null,
        artifactKind: null,
        issues: integrity.issues,
      };
    }
  }

  const envelope = validateGravityV4ArtifactEnvelope(
    options.artifact,
    options.allowDiagnosticFixture === true,
  );
  if (!envelope.ok) {
    return {
      status: "artifact_invalid",
      profile: null,
      artifactKind: null,
      issues: envelope.issues,
    };
  }

  const rawProfile = envelope.artifact.profiles.find(profile => {
    if (typeof profile !== "object" || profile === null) return false;
    return (profile as Record<string, unknown>).playerId === options.playerId;
  });
  if (rawProfile === undefined) {
    return {
      status: "profile_missing",
      profile: null,
      artifactKind: envelope.artifact.artifactKind,
      issues: [],
    };
  }

  const validated = validateGravityProfileV4(rawProfile, {
    playerId: options.playerId,
    season: options.season,
    allowDiagnosticFixture: options.allowDiagnosticFixture,
  });
  if (!validated.ok) {
    return {
      status: "profile_invalid",
      profile: null,
      artifactKind: envelope.artifact.artifactKind,
      issues: validated.issues,
    };
  }
  if (validated.profile.metadata.artifactKind !== envelope.artifact.artifactKind) {
    return {
      status: "profile_invalid",
      profile: null,
      artifactKind: envelope.artifact.artifactKind,
      issues: [{
        path: "metadata.artifactKind",
        message: "Profile artifact kind does not match its envelope.",
      }],
    };
  }

  return {
    status: "ready",
    profile: validated.profile,
    artifactKind: envelope.artifact.artifactKind,
    issues: [],
  };
}
