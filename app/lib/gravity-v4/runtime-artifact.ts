import fittedArtifact from "./fitted-artifact.json";
import { GRAVITY_V4_ARTIFACT_MANIFEST } from "./artifact-manifest";

/**
 * The fitted Gravity v4 artifact the app serves — the OZ + DZ wells, UNTIERED
 * (the NZ transition well was excluded as unvalidated, so every profile is
 * fitted-but-untiered and X-NAV-free). Produced by
 * `scripts/gravity-v4/export-profiles.ts`, which validates every profile against
 * the shipped schema before writing this file, and committed here so it bundles.
 *
 * `GRAVITY_V4_RUNTIME_MANIFEST` pins its SHA-256 and profile count. Pass both
 * to `loadGravityProfileV4` — a regenerated artifact that does not match the
 * manifest is refused (`artifact_invalid`), never served.
 */
export const GRAVITY_V4_RUNTIME_ARTIFACT: unknown = fittedArtifact;
export const GRAVITY_V4_RUNTIME_MANIFEST = GRAVITY_V4_ARTIFACT_MANIFEST;
