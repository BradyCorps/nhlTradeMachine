// ── Shareable player-card image payload ─────────────────────────────
// The browser already computes every value on the live PercentileCard
// (percentiles vs the positional field, X-NAV, gravity, roles, contract
// math). Rather than recompute any of it server-side — and risk drift —
// the client ships this flat, already-formatted payload to the card-image
// route, which is a pure renderer. The one structured piece is the slim
// gravity profile, needed to redraw the identical Spacetime lattice.

import type { GravityTier } from "./gravity";

export interface CardGravityInput {
  masses: { oz: number; nz: number; dz: number };
  tier: GravityTier;
  force: number;
  confidence: number;
  isDefenseman: boolean;
}

export interface CardStatRow {
  label: string;
  pct: number | null; // null → "No data" (never a faked 50th)
  formatted: string;
  median: string;
  barColor: string | null;
}

export interface CardImagePayload {
  name: string;
  sub: string; // "Team · POS · Age NN"
  roleLabel?: string;
  roleColor?: string;
  xnavTotal: number;

  // Contract strip
  capHitLabel: string;
  yearsLabel: string;
  fmvLabel: string;
  surplusLabel: string; // e.g. "+$1.7M · BARGAIN"
  surplusColor: string;

  // Gravity (null for goalies)
  gravity: CardGravityInput | null;

  edgeCells: { label: string; val: string; color?: string }[];
  stats: CardStatRow[];
  navCells: { label: string; val: number }[];

  peerLabel: string; // "all forwards"
  avgPercentile: number | null;

  // Same-origin-proxied headshot the client already loaded, inlined as a
  // data URL so the renderer never has to make its own network request.
  headshotDataUrl?: string | null;
}
