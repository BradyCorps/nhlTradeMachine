export const GRAVITY_V4_FEATURE_FLAG = "GRAVITY_V4_ENABLED";
// Release lock — OPENED for the OZ + DZ (untiered) v4 display. Both the OZ well
// and the DZ suppression well cleared the held-out reliability / null / identity
// gate; the NZ transition well did NOT (split-half r=0.099, essentially noise) and
// is excluded, so every profile is fitted-but-UNTIERED and X-NAV-free. Still
// env-gated below: nothing renders until GRAVITY_V4_ENABLED=true AND a fitted
// artifact is present, so an environment variable alone can never publish noise.
export const GRAVITY_V4_RELEASE_READY = true;

export function isGravityV4Enabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return GRAVITY_V4_RELEASE_READY
    && env[GRAVITY_V4_FEATURE_FLAG]?.trim().toLowerCase() === "true";
}
