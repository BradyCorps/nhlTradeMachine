export const GRAVITY_V4_FEATURE_FLAG = "GRAVITY_V4_ENABLED";
// PL-2 release lock. PL-13 and PL-14 must be completed before this can change.
// An environment variable alone must never publish an unfitted artifact.
export const GRAVITY_V4_RELEASE_READY = false;

export function isGravityV4Enabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return GRAVITY_V4_RELEASE_READY
    && env[GRAVITY_V4_FEATURE_FLAG]?.trim().toLowerCase() === "true";
}
