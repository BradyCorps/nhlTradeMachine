export const GRAVITY_V4_FEATURE_FLAG = "GRAVITY_V4_ENABLED";

export function isGravityV4Enabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[GRAVITY_V4_FEATURE_FLAG]?.trim().toLowerCase() === "true";
}
