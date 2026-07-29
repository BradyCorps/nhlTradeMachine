// Contention quadrant math — present vs future strength from NAV.
import type { Asset, XNAVResult } from "@/app/lib/trade-types";

// ── Contention Cycle Computation ─────────────────────────────
// Derives Present and Future ratings (0-10) from X-NAV data.
// Present: what the roster is worth RIGHT NOW
// Future:  what the roster will be worth in ~3 years (age decay + prospects)
//
// Calibration:
//   10 = perfect elite roster (~2800 NAV across top 10 players)
//   7+ = legitimate Cup contender
//   5-7 = playoff team, window open
//   3-5 = bubble / retooling
//   0-3 = rebuilding / tanking

const PRESENT_RATING_MAX = 2800; // NAV benchmark for a "perfect 10" roster

/** A pick is a lottery ticket on a person who does not exist yet. */
export const PICK_FUTURE_WEIGHT = 0.6;

// ── Contention thresholds (CXH7) ─────────────────────────────────
//
// The quadrant chart drew its crosshair at 5.0/5.0 while the classifier split
// at 6.5 and 5.5, so a club could be plotted in the "win now" half of the
// picture and labelled "Window Open" beneath it. The picture and the model
// disagreed, and the picture is the part people trust.
//
// One table now, read by both. The regions are deliberately NOT a clean 2×2 —
// present has three bands and future two — which is exactly why the chart has
// to ask `classifyContention` rather than assume a crosshair.
export const CONTENTION_THRESHOLDS = {
  /** Present strength at or above this is a contender outright. */
  presentContender: 6.5,
  /** Below this a club cannot win now whatever its future looks like. */
  presentPlayoff: 5.0,
  /** Future strength a playoff-calibre club needs for its window to be open. */
  futureOpen: 5.0,
  /** A weak present needs more future than that to count as opening. */
  futureOpening: 5.5,
} as const;

export type ContentionQuadrantKey =
  | "WIN_NOW" | "WINDOW_OPEN" | "WINDOW_OPENING" | "REBUILDING";

/**
 * The single classification both the rating and the chart use.
 *
 * Extracted so the visual cannot drift from the model: the chart labels each
 * region by calling this at the region's own centroid rather than hardcoding
 * which corner means what.
 */
export function classifyContention(present: number, future: number): ContentionQuadrantKey {
  const T = CONTENTION_THRESHOLDS;
  if (present >= T.presentContender && future >= T.futureOpen) return "WIN_NOW";
  if (present >= T.presentPlayoff && future >= T.futureOpen) return "WINDOW_OPEN";
  if (present >= T.presentPlayoff) return "WIN_NOW"; // strong present, thin future
  if (future >= T.futureOpening) return "WINDOW_OPENING";
  return "REBUILDING";
}

export function computeContention(
  roster: Asset[],
  navMap: Record<string, XNAVResult>,
): {
  present: number;
  future:  number;
  quadrant: "WIN_NOW" | "WINDOW_OPEN" | "WINDOW_OPENING" | "REBUILDING";
  presentLabel: string;
  futureLabel:  string;
} {
  if (roster.length === 0) return {
    present: 0, future: 0,
    quadrant: "REBUILDING",
    presentLabel: "No Data",
    futureLabel: "No Data",
  };

  const qualified = roster.filter(p =>
    p.position !== "Pick" && (p.games ?? 0) >= 10
  );

  // ── Present Rating ──────────────────────────────────────────
  // Top 6 forwards + top 3 D + top 1 goalie by NAV
  const forwards = qualified
    .filter(p => ["C","W","L","R","F"].includes(p.position))
    .sort((a, b) => (navMap[b.id]?.total ?? 0) - (navMap[a.id]?.total ?? 0))
    .slice(0, 6);

  const dmen = qualified
    .filter(p => p.position === "D")
    .sort((a, b) => (navMap[b.id]?.total ?? 0) - (navMap[a.id]?.total ?? 0))
    .slice(0, 3);

  const goalies = qualified
    .filter(p => p.position === "G")
    .sort((a, b) => (navMap[b.id]?.total ?? 0) - (navMap[a.id]?.total ?? 0))
    .slice(0, 1);

  const presentNAV = [...forwards, ...dmen, ...goalies]
    .reduce((s, p) => s + Math.max(0, navMap[p.id]?.total ?? 0), 0);

  const present = Math.min(10, Math.max(0,
    Math.round((presentNAV / PRESENT_RATING_MAX) * 10 * 10) / 10
  ));

  // ── Future Rating ───────────────────────────────────────────
  // Apply 3-year age decay to each player's NAV
  // Young players (≤23) get an upside bonus
  // Prospects in PROSPECT_TIERS add future value
  const peakAge = (pos: string) => pos === "D" ? 27 : pos === "G" ? 29 : 26;

  const futureNAV = [...forwards, ...dmen, ...goalies].reduce((s, p) => {
    const nav    = Math.max(0, navMap[p.id]?.total ?? 0);
    const age3   = p.age + 3;
    const peak   = peakAge(p.position);
    let decayFactor: number;

    if (age3 <= peak) {
      // Still approaching peak — slight upside
      decayFactor = 1.0 + Math.max(0, (peak - age3) * 0.02);
    } else {
      // Past peak — decline curve
      const yearsOver = age3 - peak;
      decayFactor = Math.max(0.3, 1.0 - (Math.pow(yearsOver, 1.4) * 0.05));
    }
    return s + nav * decayFactor;
  }, 0);

  // CXH7 — future strength has to include the assets that ARE the future.
  //
  // `qualified` drops picks and anyone under 10 games, which is right for
  // PRESENT strength — those players cannot help you win now. Applying the
  // same filter to the future rating meant a club's draft capital and its
  // unproven prospects contributed exactly nothing to its "future", so a
  // rebuild holding five first-rounders scored the same as one holding none.
  const prospectBonus = qualified
    .filter(p => p.age <= 23 && (navMap[p.id]?.upside ?? 0) > 20)
    .reduce((s, p) => s + Math.min(150, (navMap[p.id]?.upside ?? 0) * 0.5), 0);

  // Unproven youth: too few games for the present rating, all future.
  const unprovenBonus = roster
    .filter(p => p.position !== "Pick" && (p.games ?? 0) < 10 && p.age <= 23)
    .reduce((s, p) => s + Math.min(120, (navMap[p.id]?.upside ?? navMap[p.id]?.total ?? 0) * 0.5), 0);

  // Draft capital. Discounted against roster players because a pick is a
  // lottery ticket on a person who does not exist yet.
  const pickBonus = roster
    .filter(p => p.position === "Pick")
    .reduce((s, p) => s + (navMap[p.id]?.total ?? 0) * PICK_FUTURE_WEIGHT, 0);

  const future = Math.min(10, Math.max(0,
    Math.round(((futureNAV + prospectBonus + unprovenBonus + pickBonus) / PRESENT_RATING_MAX) * 10 * 10) / 10
  ));

  const quadrant = classifyContention(present, future);

  const presentLabel =
    present >= 8.0 ? "Elite" :
    present >= 6.5 ? "Contender" :
    present >= 5.0 ? "Playoff Calibre" :
    present >= 3.5 ? "Fringe Playoff" :
    present >= 2.0 ? "Rebuilding" : "Tanking";

  const futureLabel =
    future >= 8.0 ? "Bright" :
    future >= 6.0 ? "Strong" :
    future >= 4.5 ? "Solid" :
    future >= 3.0 ? "Limited" : "Bleak";

  return { present, future, quadrant, presentLabel, futureLabel };
}

// ── Live team phase / timeline ───────────────────────────────
// The seed `phase` in db.ts is a static last-season-standing snapshot, so the
// HOME/PARTNER timeline badge (and the trade-willingness logic that keys off
// phase) never moved when a roster was rebuilt or re-signed. deriveTeamPhase
// reads the CURRENT roster's present-strength rating (same contention math the
// quadrant already uses) and maps it onto the phase vocabulary, so the timeline
// tracks the roster in real time — improve the team and it climbs toward
// Contender; gut it and it slides toward Tanking.
export type TeamPhase = "Contender" | "Bubble" | "Retooling" | "Rebuilding" | "Tanking";

// Returns null when the roster lacks enough valued, established players to
// judge — the caller then keeps the existing (seed) phase rather than
// collapsing a data-thin team to "Tanking". A real NHL roster clears this
// easily; incomplete/partial data does not, so the live read only kicks in
// when it's trustworthy.
const MIN_QUALIFIED_FOR_PHASE = 9;

export function deriveTeamPhase(
  roster: Asset[],
  navMap: Record<string, XNAVResult>,
): TeamPhase | null {
  const qualified = roster.filter(p =>
    p.position !== "Pick" && (p.games ?? 0) >= 10 && navMap[p.id] != null
  );
  if (qualified.length < MIN_QUALIFIED_FOR_PHASE) return null;

  const { present } = computeContention(roster, navMap);
  return present >= 6.5 ? "Contender"
    : present >= 5.0 ? "Bubble"
    : present >= 3.5 ? "Retooling"
    : present >= 2.0 ? "Rebuilding"
    : "Tanking";
}

// ── GM Analysis Tabs ─────────────────────────────────────────
export const GM_PLUM = "var(--fig)";
export const GM_PLUM_FAINT = "rgba(83, 46, 59, 0.08)";
export const GM_PLUM_LIGHT = "var(--fig-bright)";

