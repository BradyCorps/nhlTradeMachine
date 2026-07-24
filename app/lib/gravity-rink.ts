// ── Gravity rink geometry — the Spacetime lattice, as pure data ─────
// Extracted from GravityField's FieldDiagram so the *exact same* warped
// lattice can be rendered two ways: live in the browser (React SVG with
// CSS-variable colors) and server-side in the shareable-card PNG route
// (Satori/next-og, which has no CSS variables and needs concrete hex).
// Geometry lives here once; both callers map over the same arrays.

import type { GravityTier, ZoneMasses } from "./gravity";

export interface RinkMassProfile {
  masses: ZoneMasses;
}

export interface RinkZone {
  key: keyof ZoneMasses;
  m: number;
  cx: number;
  repulsive: boolean;
}

export interface RinkGeometry {
  W: number;
  H: number;
  rinkX: number;
  rinkY: number;
  rinkW: number;
  rinkH: number;
  midY: number;
  centerX: number;
  blue1: number;
  blue2: number;
  rowLines: string[];
  colLines: string[];
  zones: RinkZone[];
}

// The flat lattice is league-average hockey. Wells (positive oz/nz) pull
// vertices inward; the DZ dome (positive dz) pushes them away; negative
// mass inverts the curvature. Inverse-square falloff with softening — the
// GR rubber-sheet, on a 296×118 sheet.
const COLS = 24;
const ROWS = 10;
const SOFT = 900; // px² softening keeps displacement finite at the core
const K = 520; // displacement strength per unit mass
const MAX_PULL = 11; // px cap so the lattice never folds over itself

export function computeRinkGeometry(profile: RinkMassProfile): RinkGeometry {
  const W = 320;
  const H = 240;
  const { oz, nz, dz } = profile.masses;

  const rinkX = 12,
    rinkY = 52,
    rinkW = 296,
    rinkH = 118;
  const midY = rinkY + rinkH / 2;
  const blue1 = rinkX + rinkW / 3;
  const blue2 = rinkX + (rinkW * 2) / 3;
  const centerX = rinkX + rinkW / 2;

  const zones: RinkZone[] = [
    { key: "dz", m: dz, cx: rinkX + rinkW / 6, repulsive: true },
    { key: "nz", m: nz, cx: centerX, repulsive: false },
    { key: "oz", m: oz, cx: rinkX + (rinkW * 5) / 6, repulsive: false },
  ];

  const sources = zones.map((zn) => ({
    x: zn.cx,
    y: midY,
    s: (zn.repulsive ? -zn.m : zn.m) * K, // dome repels, well attracts
  }));

  function warp(px: number, py: number): string {
    let dx = 0,
      dy = 0;
    for (const src of sources) {
      const vx = src.x - px,
        vy = src.y - py;
      const d2 = vx * vx + vy * vy + SOFT;
      dx += (vx / d2) * src.s;
      dy += (vy / d2) * src.s;
    }
    const mag = Math.hypot(dx, dy);
    if (mag > MAX_PULL) {
      dx = (dx / mag) * MAX_PULL;
      dy = (dy / mag) * MAX_PULL;
    }
    return `${(px + dx).toFixed(1)},${(py + dy).toFixed(1)}`;
  }

  const inX = rinkX + 4,
    inW = rinkW - 8;
  const inY = rinkY + 4,
    inH = rinkH - 8;

  const rowLines: string[] = [];
  for (let r = 0; r <= ROWS; r++) {
    const py = inY + (inH * r) / ROWS;
    const pts: string[] = [];
    for (let c = 0; c <= COLS; c++) pts.push(warp(inX + (inW * c) / COLS, py));
    rowLines.push(pts.join(" "));
  }
  const colLines: string[] = [];
  for (let c = 0; c <= COLS; c++) {
    const px = inX + (inW * c) / COLS;
    const pts: string[] = [];
    for (let r = 0; r <= ROWS; r++) pts.push(warp(px, inY + (inH * r) / ROWS));
    colLines.push(pts.join(" "));
  }

  return { W, H, rinkX, rinkY, rinkW, rinkH, midY, centerX, blue1, blue2, rowLines, colLines, zones };
}

// Human-readable zone titles (matches the live diagram).
export const ZONE_TITLE: Record<keyof ZoneMasses, string> = {
  oz: "OZ Well",
  nz: "NZ Well",
  dz: "DZ Dome",
};

// One-word qualifier for a zone mass — the label printed under each well.
// Thresholds mirror zoneContext() in GravityField.tsx.
export function zoneQualifier(zone: keyof ZoneMasses, m: number): string {
  switch (zone) {
    case "oz":
      if (m >= 0.75) return "Supermassive";
      if (m >= 0.45) return "Strong";
      if (m >= 0.15) return "Positive";
      if (m >= -0.15) return "Flat";
      return "Caved";
    case "nz":
      if (m >= 0.6) return "Transition Engine";
      if (m >= 0.3) return "Strong Carry";
      if (m >= 0.05) return "Detectable";
      if (m >= -0.15) return "Flat";
      return "Anchor";
    case "dz":
      if (m >= 0.6) return "Fortress";
      if (m >= 0.3) return "Solid Dome";
      if (m >= 0.05) return "Stable";
      if (m >= -0.15) return "Flat";
      return "Breached";
  }
}

// Concrete ledger palette (light theme) — the CSS-variable values resolved
// to hex, for renderers with no stylesheet context (Satori/next-og).
export const RINK_INK = "#1c140a";
export const RINK_INK_FAINT = "#6e5a3d";
export const RINK_RED = "#b83020";
export const RINK_NAVY = "#1a2e5c";
export const RINK_GREEN = "#1a5c2e";
export const RINK_AMBER = "#d4a017";
export const RINK_ICE = "#ece0be";

// Tier color as concrete hex (gravityTierColor() resolved).
export function rinkTierColor(tier: GravityTier): string {
  switch (tier) {
    case "SUPERMASSIVE":
    case "STAR":
      return RINK_GREEN;
    case "MAIN_SEQUENCE":
      return RINK_AMBER;
    case "SATELLITE":
    case "ASTEROID":
      return RINK_INK_FAINT;
    case "BLACK_HOLE":
      return RINK_RED;
  }
}
