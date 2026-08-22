import fittedArtifact from "./fitted-artifact.json";

/**
 * The fitted Gravity v4 artifact the app serves — the OZ + DZ wells, UNTIERED
 * (the NZ transition well was excluded as unvalidated, so every profile is
 * fitted-but-untiered and X-NAV-free). Produced by
 * `scripts/gravity-v4/export-profiles.ts`, which validates every profile against
 * the shipped schema before writing this file, and committed here so it bundles.
 *
 * The committed default is an EMPTY profile set: until the real artifact is
 * generated and committed, every lookup returns `profile_missing` and nothing
 * renders — the display fails closed even with the environment flag on.
 */
export const GRAVITY_V4_RUNTIME_ARTIFACT: unknown = fittedArtifact;
