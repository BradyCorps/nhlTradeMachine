// ── Offseason phase order ────────────────────────────────────────
//
// The offseason runs as a chain of full-screen phases, each ending in a button
// that names where the user is going. Those labels were written independently
// inside each screen, with nothing tying them to the transition the handler
// actually performs — so the last one promised "Proceed to Free Agency" when
// free agency had already happened two screens earlier, inside the re-sign
// phase's open-market panel (OFF1).
//
// One table, so a label and a transition cannot disagree.

export type OffseasonPhase =
  | "DRAFT_NIGHT"      // year 1 only — the entry draft
  | "DRAFT_SUMMARY"    // Cup Run years 2-3 — the draft was resolved at rollover
  | "RESIGN"           // own pending FAs + the open market
  | "OFFER_SHEETS";    // RFA offer sheets — the last gate before the season

export type OffseasonDestination = OffseasonPhase | "SEASON";

interface PhaseStep {
  /** Where finishing this phase actually lands the user. */
  next: OffseasonDestination;
  /** The CTA that ends the phase. Must describe `next`, not a wished-for order. */
  cta: string;
}

export const OFFSEASON_FLOW: Record<OffseasonPhase, PhaseStep> = {
  DRAFT_NIGHT:   { next: "RESIGN",       cta: "Done — Proceed to Re-Sign →" },
  DRAFT_SUMMARY: { next: "RESIGN",       cta: "Done — Re-Sign Phase →" },
  // Free agency is the market panel INSIDE this phase, not a later screen.
  RESIGN:        { next: "OFFER_SHEETS", cta: "Done — RFA Offer Sheets →" },
  // Nothing follows: the offseason closes and the trade bench takes over.
  OFFER_SHEETS:  { next: "SEASON",       cta: "Done — Start Armchair GM →" },
};

export const offseasonCta = (phase: OffseasonPhase): string => OFFSEASON_FLOW[phase].cta;

export const offseasonNext = (phase: OffseasonPhase): OffseasonDestination =>
  OFFSEASON_FLOW[phase].next;
