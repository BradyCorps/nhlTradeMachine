// ── Gravity release-channel gates ───────────────────────────────────────
//
// Displaying an experimental model, adding it to trade value, and letting it
// move simulated standings are three different product claims. Keep their
// switches independent and fail closed: an absent, malformed, or non-"true"
// value leaves that channel disabled.

export const GRAVITY_V3_DISPLAY_FEATURE_FLAG =
  "NEXT_PUBLIC_GRAVITY_V3_DISPLAY_ENABLED";
export const GRAVITY_V3_XNAV_FEATURE_FLAG =
  "NEXT_PUBLIC_GRAVITY_V3_XNAV_ENABLED";
export const GRAVITY_V3_SIMULATION_FEATURE_FLAG =
  "GRAVITY_V3_SIMULATION_ENABLED";

export type GravityFeatureEnvironment = Record<string, string | undefined>;

const explicitlyEnabled = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === "true";

export function isGravityV3DisplayEnabled(
  env?: GravityFeatureEnvironment,
): boolean {
  const value = env === undefined
    ? process.env.NEXT_PUBLIC_GRAVITY_V3_DISPLAY_ENABLED
    : env[GRAVITY_V3_DISPLAY_FEATURE_FLAG];
  return explicitlyEnabled(value);
}

export function isGravityV3XnavEnabled(
  env?: GravityFeatureEnvironment,
): boolean {
  const value = env === undefined
    ? process.env.NEXT_PUBLIC_GRAVITY_V3_XNAV_ENABLED
    : env[GRAVITY_V3_XNAV_FEATURE_FLAG];
  return explicitlyEnabled(value);
}

export function isGravityV3SimulationEnabled(
  env?: GravityFeatureEnvironment,
): boolean {
  const value = env === undefined
    ? process.env.GRAVITY_V3_SIMULATION_ENABLED
    : env[GRAVITY_V3_SIMULATION_FEATURE_FLAG];
  return explicitlyEnabled(value);
}
