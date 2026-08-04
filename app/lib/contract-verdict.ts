// ── contract-verdict.ts ──────────────────────────────────────────
//
// Whether a contract is a bargain, an overpay, or neither — decided by the
// pricing model's own error rather than by a round number.
//
// WHY THIS EXISTS
//
// Three surfaces each carried their own copy of `surplus >= 1 ? "BARGAIN" :
// surplus <= -1 ? "OVERPAY" : "FAIR"`. That $1M was hand-picked, and it is
// smaller than the model is wrong by. The fitted skater model's walk-forward
// mean error is $1.22M for forwards and $1.35M for defence; the goalie model's
// is $1.44M. So a $1.1M gap — Jack Eichel's, as it happens — was printed as an
// OVERPAY when it is comfortably inside the noise.
//
// WHAT THE MODEL IS ENTITLED TO SAY
//
// It was fitted on what clubs actually paid, which means it cannot tell you a
// club made a mistake: its whole training set is clubs' decisions, mistakes
// included. Measured against 1,995 contracts, when it flags an overpay the gap
// is still there three seasons later only 57% of the time. That is real signal
// and it is not a verdict.
//
// So the language here is deliberately weaker than it was. A gap inside the
// margin is "priced about right". A gap outside it says the deal is unusual for
// the profile, not that somebody blundered.
//
// AND SOMETIMES THERE IS NO DEAL AT ALL
//
// `roster-assembly` zeroes `capHit` for pending free agents deliberately, so
// trade pricing treats them as a nought-year rental, and keeps the real figure
// in `lastCapHit`. Six surfaces render contracts and only two knew that. The
// other four showed "$0.0M x 0yr" beside a $9.6M market price and called it a
// bargain in green — the single most damaging thing a valuation can do, because
// it is confidently wrong about a player anyone can look up.

import { SEASON } from "@/app/lib/season-config";
import { SKATER_FMV_VALIDATION, unitForPosition } from "@/app/lib/skater-fmv";
import { FMV_VALIDATION as GOALIE_FMV_VALIDATION } from "@/app/lib/goalie-fmv";

export type VerdictKind = "bargain" | "fair" | "overpay" | "unpriced" | "noContract";
export type VerdictTone = "good" | "bad" | "neutral";

export interface ContractVerdict {
  kind: VerdictKind;
  /** Model price minus what he is actually paid, in millions. Null if unpriced. */
  surplus: number | null;
  /**
   * How far the gap has to run before it means anything, in millions — the
   * model's own walk-forward error at the ceiling being priced against.
   */
  margin: number;
  /** Short uppercase word for a chip. */
  label: string;
  tone: VerdictTone;
  /** A sentence that says what the chip means, for a title or tooltip. */
  note: string;
}

/**
 * The model's mean walk-forward error for this position, as a share of the cap.
 *
 * Published by each fit rather than guessed here, so a refit moves the
 * threshold automatically and cannot leave this stale.
 */
export function verdictMarginCapPct(position: string | null | undefined): number {
  const p = String(position ?? "").trim().toUpperCase();
  if (p === "G") return GOALIE_FMV_VALIDATION.maeCapPct;
  return SKATER_FMV_VALIDATION[unitForPosition(p)].maeCapPct;
}

/** The same margin in millions, against a given ceiling. */
export const verdictMargin = (
  position: string | null | undefined,
  capCeilingM: number = SEASON.capCeiling,
): number => verdictMarginCapPct(position) * capCeilingM;

export interface ContractVerdictInput {
  /** The model's price, in millions. Null when it could not price him. */
  fmvAav: number | null | undefined;
  /** What he actually costs, in millions, after any retention. */
  capHit: number;
  position: string | null | undefined;
  capCeilingM?: number;
  /**
   * True when the deal has run out and he is a pending free agent.
   *
   * `roster-assembly` zeroes `capHit` for these players on purpose, so trade
   * pricing treats them as a nought-year rental. Without this flag a $0 cap hit
   * against a $9.6M market price reads as a $9.6M bargain, which is how Jason
   * Robertson came to be advertised as the steal of the summer while not being
   * under contract at all.
   */
  expiresThisOffseason?: boolean;
  /** The expiring deal's real AAV — `lastCapHit`, which is never zeroed. */
  lastCapHit?: number | null;
}

const money = (n: number) => `$${Math.abs(n).toFixed(1)}M`;

export function contractVerdict(input: ContractVerdictInput): ContractVerdict {
  const capCeilingM = input.capCeilingM ?? SEASON.capCeiling;
  const margin = verdictMargin(input.position, capCeilingM);

  if (input.fmvAav == null || !isFinite(input.fmvAav)) {
    return {
      kind: "unpriced", surplus: null, margin,
      label: "NOT PRICED", tone: "neutral",
      note: "There is not enough recorded play to put a market price on this contract.",
    };
  }

  // No contract is not a cheap contract. There is nothing to judge, and the
  // arithmetic that would judge it produces its most flattering possible answer
  // — which is exactly the wrong failure direction on a player page.
  if (input.expiresThisOffseason || (input.capHit <= 0 && (input.lastCapHit ?? 0) > 0)) {
    const was = input.lastCapHit && input.lastCapHit > 0
      ? ` His expiring deal paid ${money(input.lastCapHit)}.` : "";
    return {
      kind: "noContract", surplus: null, margin,
      label: "PENDING FREE AGENT", tone: "neutral",
      note: `He is not under contract, so there is no deal to price against. The model puts his market at ${money(input.fmvAav)}.${was}`,
    };
  }

  const surplus = input.fmvAav - input.capHit;

  if (Math.abs(surplus) <= margin) {
    return {
      kind: "fair", surplus, margin,
      label: "PRICED ABOUT RIGHT", tone: "neutral",
      note: `The gap of ${money(surplus)} is inside the model's own margin of ${money(margin)}, so it is not evidence of anything.`,
    };
  }

  const beyond = Math.abs(surplus) - margin;
  const shared = `${money(surplus)} is ${money(beyond)} beyond the model's ${money(margin)} margin. The model prices what clubs typically pay for this profile, and when it disagrees at this size the gap is still there three seasons later about 57% of the time.`;

  return surplus > 0
    ? { kind: "bargain", surplus, margin, label: "PAID BELOW MARKET", tone: "good",
        note: `He costs less than the model says his profile usually signs for. ${shared}` }
    : { kind: "overpay", surplus, margin, label: "PAID ABOVE MARKET", tone: "bad",
        note: `He costs more than the model says his profile usually signs for. ${shared}` };
}

/** `+$1.7M vs market` / `−$0.4M vs market`, or a dash when there is nothing to compare. */
export function surplusText(v: ContractVerdict): string {
  if (v.kind === "noContract") return "no deal to price";
  if (v.surplus == null) return "—";
  const sign = v.surplus > 0 ? "+" : v.surplus < 0 ? "−" : "";
  return `${sign}${money(v.surplus)} vs market`;
}

/**
 * What to call the model's number on screen.
 *
 * NOT "Fair Market Value". That name asserts the figure is what a player is
 * WORTH, which is a normative claim this model cannot support — it predicts
 * what clubs pay, and it is fitted on their mistakes as well as their
 * successes. "Market price" says the narrower, true thing.
 */
export const MODEL_PRICE_LABEL = "Market price";
export const MODEL_PRICE_SHORT = "MKT";
export const MODEL_PRICE_NOTE =
  "What this profile typically signs for, from a model fitted on 1,996 contracts. It predicts the market rather than judging it.";

/** Ledger palette for a verdict tone. Neutral is ink, never green or red. */
export const verdictColor = (tone: VerdictTone): string =>
  tone === "good" ? "var(--ledger-green)"
  : tone === "bad" ? "var(--ledger-red)"
  : "var(--ledger-ink-faint)";
