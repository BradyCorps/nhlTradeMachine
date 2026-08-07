// ── Gravity release channels ────────────────────────────────────────────
//
// Keep the model computation pure in gravity.ts. These wrappers are the only
// deployment boundary for public display, X-NAV, and simulated standings, so
// enabling one channel cannot silently activate either of the others.

import {
  computeGravity,
  simOnIceDelta,
  type GravityProfile,
} from "@/app/lib/gravity";
import {
  isGravityV3DisplayEnabled,
  isGravityV3SimulationEnabled,
  isGravityV3XnavEnabled,
  type GravityFeatureEnvironment,
} from "@/app/lib/gravity-feature-flags";
import type { Asset } from "@/app/lib/trade-types";

export function gravityForDisplay(
  asset: Asset,
  env?: GravityFeatureEnvironment,
): GravityProfile | null {
  return isGravityV3DisplayEnabled(env) ? computeGravity(asset) : null;
}

export function gravityForXnav(
  asset: Asset,
  env?: GravityFeatureEnvironment,
): GravityProfile | null {
  if (!isGravityV3XnavEnabled(env)) return null;
  const profile = computeGravity(asset);
  return profile?.evidenceStatus === "QUALIFIED" ? profile : null;
}

export function gravityForSimulation(
  asset: Asset,
  env?: GravityFeatureEnvironment,
): number {
  if (!isGravityV3SimulationEnabled(env)) return 0;
  return simOnIceDelta(computeGravity(asset));
}
