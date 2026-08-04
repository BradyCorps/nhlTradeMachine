// ── nav-breakdown.ts ─────────────────────────────────────────────
//
// The accounting identity for X-NAV.
//
// THE BUG THIS EXISTS TO CLOSE
//
// The dossier and the player card printed a panel headed "Value Breakdown":
// OFF, DEF, GRAV, AGE, CAP, UPS, under a headline X-NAV. Every reader takes
// that for a decomposition. It was not one, and could not be:
//
//   • the total is built from `defTotal`, but the panel printed `defDisplay`,
//     a different blend computed for the STRAND rails;
//   • `upside` was `max(0, ageTotal) + teamControlValue` — `ageTotal` is the
//     AGE row, so the panel counted it twice;
//   • the positional premium, development discount, franchise floor and
//     thin-sample credibility regression all move the headline and appeared
//     nowhere.
//
// Two surfaces had already noticed and bolted on a plug row computed as
// `total − (off + def + age + cap)`, which makes the arithmetic close without
// saying what the difference is. And `applyTradeRequestDiscount` carried a
// comment claiming it deducted from cap "so the off/def/age/cap sum invariant
// holds" — documenting an invariant the engine never had.
//
// HOW IT IS CLOSED
//
// The engine now emits an ordered list of signed STAGES whose sum is the total
// by construction: each multiplicative step is recorded as the delta it applied
// rather than left implicit. `reconcileStages` then rounds them so the integers
// a reader sees add up exactly to the integer headline.
//
// The split matters. Rounding is enforced HERE, so a user can never be shown
// numbers that do not add up. Engine correctness is enforced by a TEST, via
// `stageDrift` — otherwise this function would silently paper over exactly the
// class of bug it was written to expose.

export type NavStageKind = "component" | "adjustment";

export interface NavStage {
  key: string;
  label: string;
  /** Signed contribution to the total, unrounded. */
  value: number;
  /**
   * `component` — on-ice or contract value the model measured.
   * `adjustment` — a transformation the model applied to that value.
   *
   * Worth separating in the display: a reader should be able to see how much
   * of a valuation is measurement and how much is the model's own judgement.
   */
  kind: NavStageKind;
}

/** How far the stages are from explaining the total, before any rounding. */
export function stageDrift(stages: NavStage[], total: number): number {
  return total - stages.reduce((sum, s) => sum + s.value, 0);
}

/**
 * Round stages to integers that sum EXACTLY to `Math.round(total)`.
 *
 * Largest-remainder apportionment: floor everything, then hand out the
 * remaining units to the rows with the largest fractional parts. Every row
 * lands within 1 of its true value, which a naive "dump the drift on the
 * biggest row" would not guarantee.
 *
 * If the caller hands over stages that do not come close to the total, this
 * still returns rows that add up — the display has no honest alternative — and
 * `stageDrift` is how a test notices.
 */
export function reconcileStages(stages: NavStage[], total: number): NavStage[] {
  const target = Math.round(total);
  if (stages.length === 0) {
    // Nothing to decompose. Rather than print an empty panel under a non-zero
    // headline, say plainly that the whole number is unexplained.
    return target === 0 ? [] : [{ key: "total", label: "Value", value: target, kind: "component" }];
  }

  const floors = stages.map(s => Math.floor(s.value));
  const seated = floors.reduce((sum, f) => sum + f, 0);
  let remaining = target - seated;

  // Rows most deserving of the next unit first (or least, when handing units
  // back because the floors overshot).
  const order = stages
    .map((s, i) => ({ i, rem: s.value - Math.floor(s.value) }))
    .sort((a, b) => remaining >= 0 ? b.rem - a.rem : a.rem - b.rem);

  const out = floors.slice();
  const step = remaining >= 0 ? 1 : -1;
  let cursor = 0;
  while (remaining !== 0) {
    // Wraps if the drift exceeds one unit per row — only reachable when the
    // engine is wrong, and the test catches that separately.
    out[order[cursor % order.length].i] += step;
    remaining -= step;
    cursor++;
  }

  return stages.map((s, i) => ({ ...s, value: out[i] }));
}

/**
 * The rows to draw: reconciled, then stripped of anything that rounded to zero.
 *
 * Dropping zeros is safe for the identity — they contribute nothing to the sum
 * — and keeps a panel from listing four adjustments that did not fire.
 */
export function navStagesForDisplay(stages: NavStage[] | undefined, total: number): NavStage[] {
  return reconcileStages(stages ?? [], total).filter(s => s.value !== 0);
}

/** True when the displayed rows account for the displayed headline exactly. */
export function stagesReconcile(displayed: NavStage[], total: number): boolean {
  return displayed.reduce((sum, s) => sum + s.value, 0) === Math.round(total);
}

// ── Display vocabulary ───────────────────────────────────────────
// One source for what a row is called and what it means, so the dossier, the
// card and the timeline cannot describe the same stage three different ways.

/** Compact label for narrow surfaces (the card's value column, agate tables). */
export const NAV_STAGE_SHORT: Record<string, string> = {
  off: "OFF", def: "DEF", age: "AGE", grav: "GRAV", cap: "CAP",
  multiplier: "MULT", positional: "POS", development: "DEV",
  franchiseFloor: "FLOOR", credibility: "CRED", leverage: "LEV",
  impact: "STOP", youngFloor: "CTRL", roleCeiling: "CEIL",
  pick: "PICK", prospect: "PRSP", total: "VALUE",
};

/** What the row actually means, for a tooltip. */
export const NAV_STAGE_DESC: Record<string, string> = {
  off: "On-ice offence — scoring, expected goals, production.",
  def: "On-ice defence as the valuation used it. The DEF rating shown on the STRAND rails is a different, descriptive blend.",
  age: "Age curve — a youth premium or a decline discount on projected value.",
  grav: "Gravity — the territorial residual left after the ordinary impact terms.",
  cap: "Contract surplus — the gap between market value and what the club pays, including team-control rights.",
  multiplier: "A manually applied asset multiplier.",
  positional: "Positional scarcity — a centre or a genuine top-pair defenceman is harder to replace.",
  development: "Development risk — a young player's value discounted for bust probability, relieved by NHL track record.",
  franchiseFloor: "Franchise floor — a proven cornerstone held above what the surplus model alone would pay.",
  credibility: "Sample credibility — a thin NHL sample regressed toward a replacement anchor.",
  leverage: "Trade-request leverage — a public request costs the club negotiating position.",
  impact: "Projected stopping value above expected, at the workload the model expects.",
  youngFloor: "Cost-controlled floor — cheap years on a capable goalie carry value the surplus model understates.",
  roleCeiling: "Role ceiling — a hard cap applied by starter/tandem/backup classification. Two goalies above it come out tied.",
  pick: "Draft-pick value at this selection range, discounted for how far out it is.",
  prospect: "Prospect value from draft pedigree and junior production, before an NHL sample exists.",
  total: "Unexplained — the model produced this headline without a breakdown.",
};

export const navStageShort = (key: string): string => NAV_STAGE_SHORT[key] ?? key.toUpperCase();
export const navStageDesc = (key: string): string => NAV_STAGE_DESC[key] ?? "";

// ── Two readings of one number ───────────────────────────────────
//
// WHY THIS EXISTS
//
// X-NAV blends what a player does on the ice with what his contract costs, and
// prints one figure. That is the right number for a trade — a general manager
// is never indifferent between an $18.8M Celebrini and a $1M one — but it means
// a rich deal can swallow a good player, and a reader cannot see which half is
// which.
//
// The obvious alternative, dropping the contract, is worse: it would say those
// two Celebrinis are worth the same, which describes nobody. So the fix is to
// show both readings rather than pick one.
//
// APPORTIONING THE ADJUSTMENTS
//
// The multiplicative steps — scarcity, development risk, the franchise floor,
// sample credibility — apply to the on-ice value and the contract TOGETHER, so
// neither owns them outright. Each is split in proportion to the absolute size
// of the two bases it acted on, which is the same reasoning as the largest
// remainder above: attribute in proportion to contribution, and never let the
// parts stop summing to the whole.

/** Stages that describe the contract rather than the player. */
const CONTRACT_STAGE_KEYS = new Set(["cap", "youngFloor"]);

export interface NavSplit {
  /** What the player is, in NAV: on-ice value plus its share of the adjustments. */
  production: number;
  /** What the contract does to that, in NAV. Negative means the deal costs value. */
  contract: number;
  /** `production + contract`, equal to the rounded headline by construction. */
  total: number;
  /** False when the engine gave no breakdown, so neither figure means anything. */
  known: boolean;
}

/**
 * Split a valuation into what the player is and what his contract does.
 *
 * Both figures are integers and they sum EXACTLY to the rounded headline, for
 * the same reason the stage rows do: a reader must never be shown two numbers
 * that do not add up to the third.
 */
export function navSplit(stages: NavStage[] | undefined, total: number): NavSplit {
  const target = Math.round(total);
  const rows = stages ?? [];
  if (rows.length === 0) {
    return { production: target, contract: 0, total: target, known: false };
  }

  let baseProduction = 0, baseContract = 0, adjustment = 0;
  for (const s of rows) {
    // Key before kind, deliberately. The goalie cost-controlled floor is an
    // `adjustment` by kind because of how the engine applies it, but it is a
    // statement about cheap years on a deal — testing `kind` first sent it into
    // the apportioned pool and credited most of it to the goalie.
    if (CONTRACT_STAGE_KEYS.has(s.key)) baseContract += s.value;
    else if (s.kind === "adjustment") adjustment += s.value;
    else baseProduction += s.value;
  }

  // Weight by absolute size: a negative contract still shaped the adjustments
  // that acted on it, and signed weights would let a large negative flip the
  // apportionment inside out.
  const weight = Math.abs(baseProduction) + Math.abs(baseContract);
  const productionShare = weight > 0 ? Math.abs(baseProduction) / weight : 1;

  const production = Math.round(baseProduction + adjustment * productionShare);
  // Taken as the remainder so the two always sum to the headline, whatever
  // rounding did to the first.
  return { production, contract: target - production, total: target, known: true };
}

/**
 * Plain-language reading of the two figures together.
 *
 * Written so the contract never reads as a verdict on the player: a deal that
 * costs value is a fact about the deal.
 */
export function navSplitNote(split: NavSplit): string {
  if (!split.known) return "No breakdown available for this valuation.";
  if (split.contract === 0) return "His contract neither adds to nor subtracts from his trade value.";
  return split.contract > 0
    ? `He is worth ${split.production} on the ice, and his contract adds ${split.contract} on top of that.`
    : `He is worth ${split.production} on the ice; his contract gives back ${Math.abs(split.contract)} of it.`;
}
