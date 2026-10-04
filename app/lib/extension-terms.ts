// ── extension-terms.ts ───────────────────────────────────────────
//
// Pure rules for a signed contract extension as the admin Contracts panel
// records it. One module so the form's preview, the endpoint's validation and
// the roster's lifecycle read all say the same thing about the same numbers.
//
// UNITS. Every dollar figure on the players table is in MILLIONS of dollars.
// `extensionCapHit` is the ANNUAL average value (AAV), never the total: a
// 6-year, $75M deal is `extensionCapHit: 12.5, extensionYears: 6`. The bounds
// below make "$75M typed into the annual box" an error rather than a roster in
// which one winger costs three quarters of the cap.
//
// START SEASON IS DERIVED, NOT STORED. The table has no extension start column.
// An extension follows the deal it extends, and that deal's `expiryYear` is the
// anchor that does not drift (see contract-term.ts): the extension's first
// season is the season beginning in `expiryYear`. A current deal ending after
// 2026-27 has `expiryYear` 2027, so the extension starts 2027-28. Because it is
// derived it is labelled derived wherever it is shown, and when the anchor is
// missing or implausible nothing is guessed — the timing is reported as
// unanchored instead.
//
// This module does not touch the database and does not change any valuation.

import { plausibleAnchor, MAX_CBA_TERM } from "@/app/lib/contract-term";

// ── Bounds ───────────────────────────────────────────────────────

/** Annual value bounds, $M. 25 is above 20% of the highest announced ceiling. */
export const EXTENSION_MIN_AAV = 0.5;
export const EXTENSION_MAX_AAV = 25;
export const EXTENSION_MIN_TERM = 1;
export const EXTENSION_MAX_TERM = MAX_CBA_TERM;

export type ExtensionInputMode = "total" | "aav";

// ── Money ────────────────────────────────────────────────────────

/** Whole dollars, expressed in $M — the finest resolution a contract has. */
export const roundToDollar = (millions: number): number =>
  Math.round(millions * 1e6) / 1e6;

/** AAV from a total contract value ($M) and a whole-year term. */
export function aavFromTotal(totalMillions: number, years: number): number {
  return roundToDollar(totalMillions / years);
}

/** Total contract value ($M) from an AAV ($M) and a whole-year term. */
export function totalFromAav(aavMillions: number, years: number): number {
  return roundToDollar(aavMillions * years);
}

/** "$12.5M", "$3.85M", "$10.714286M" — trimmed, never scientific. */
export function formatMillions(millions: number): string {
  const text = roundToDollar(millions).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  return `$${text}M`;
}

// ── Input parsing and validation ─────────────────────────────────

export interface ExtensionInput {
  mode: ExtensionInputMode;
  /** The figure the operator typed, $M — a total in "total" mode, an AAV in "aav" mode. */
  value: number;
  years: number;
}

export type ParsedExtension =
  | { ok: true; years: number; aav: number; total: number; exact: boolean }
  | { ok: false; errors: string[] };

const isWholeNumber = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Number.isInteger(n);

/**
 * Validate an extension and compute its counterpart figure.
 *
 * `exact` is false when the total does not divide into whole dollars across the
 * term, so the stored AAV times the term differs from the total typed.
 */
export function parseExtensionInput(input: {
  mode: ExtensionInputMode;
  value: unknown;
  years: unknown;
}): ParsedExtension {
  const errors: string[] = [];
  const { mode } = input;
  const years = input.years;
  const value = input.value;

  if (!isWholeNumber(years)) errors.push("Term must be a whole number of years.");
  else if (years < EXTENSION_MIN_TERM || years > EXTENSION_MAX_TERM) {
    errors.push(`Term must be between ${EXTENSION_MIN_TERM} and ${EXTENSION_MAX_TERM} years.`);
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push(mode === "total" ? "Total value must be a positive number of $ millions." : "Annual value must be a positive number of $ millions.");
  }
  if (errors.length > 0) return { ok: false, errors };

  const term = years as number;
  const typed = value as number;
  const aav = mode === "total" ? aavFromTotal(typed, term) : roundToDollar(typed);
  const total = mode === "total" ? roundToDollar(typed) : totalFromAav(typed, term);

  if (aav < EXTENSION_MIN_AAV || aav > EXTENSION_MAX_AAV) {
    errors.push(
      mode === "aav" && aav > EXTENSION_MAX_AAV
        ? `${formatMillions(aav)} is not a plausible annual cap hit (max ${formatMillions(EXTENSION_MAX_AAV)}). If that is the total contract value, switch to Total mode.`
        : `Annual value ${formatMillions(aav)} is outside ${formatMillions(EXTENSION_MIN_AAV)}–${formatMillions(EXTENSION_MAX_AAV)}.`,
    );
    return { ok: false, errors };
  }
  return { ok: true, years: term, aav, total, exact: totalFromAav(aav, term) === total };
}

// ── Signing date ─────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Earliest date a current-era signing could carry. */
export const EARLIEST_SIGNING_DATE = "2005-07-13";

/** The date part of an instant, UTC. */
export const isoDay = (when: Date | number = Date.now()): string =>
  new Date(when).toISOString().slice(0, 10);

/**
 * A real calendar date in YYYY-MM-DD form, not in the future, not before the
 * current CBA era. Returns the normalised string or an error message.
 *
 * "Not in the future" allows one day of slack for the operator's time zone.
 * A signing date is the date the deal was signed — it is never the moment the
 * row was entered, and nothing here defaults to the latter.
 */
export function validateSigningDate(
  value: unknown,
  now: Date | number = Date.now(),
): { ok: true; date: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: "Signing date must be a YYYY-MM-DD date." };
  const m = ISO_DATE.exec(value);
  if (!m) return { ok: false, error: "Signing date must be a YYYY-MM-DD date." };
  const probe = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (isoDay(probe) !== value) return { ok: false, error: `${value} is not a real calendar date.` };
  if (value < EARLIEST_SIGNING_DATE) return { ok: false, error: `Signing date ${value} is before ${EARLIEST_SIGNING_DATE}.` };
  const limit = isoDay(new Date(typeof now === "number" ? now : now.getTime()).getTime() + 86_400_000);
  if (value > limit) return { ok: false, error: `Signing date ${value} is in the future.` };
  return { ok: true, date: value };
}

// ── Season labels ────────────────────────────────────────────────

/** 2027 → "2027-28". */
export const seasonLabelFromStartYear = (startYear: number): string =>
  `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

// ── Timing ───────────────────────────────────────────────────────

export type ExtensionFlag =
  /** The current deal has no usable expiry year, so the start cannot be derived. */
  | "NO_ANCHOR"
  /** Only the old status flags said the deal had ended; how far in is unknown. */
  | "ELAPSED_UNKNOWN"
  /** The current deal's stored term disagrees with its expiry year. */
  | "TERM_ANCHOR_MISMATCH"
  /** The signing date falls after the season the extension begins in. */
  | "SIGNED_AFTER_START"
  /** The extension has no term on record; one year is being assumed. */
  | "TERM_MISSING";

export const EXTENSION_FLAG_TEXT: Record<ExtensionFlag, string> = {
  NO_ANCHOR: "The current contract has no usable expiry year, so the extension's start season cannot be derived.",
  ELAPSED_UNKNOWN: "How much of the extension has elapsed cannot be told without an expiry year; it is treated as just starting.",
  TERM_ANCHOR_MISMATCH: "The current contract's years remaining disagree with its expiry year. Timing follows the expiry year.",
  SIGNED_AFTER_START: "The signing date is after the season the extension begins in.",
  TERM_MISSING: "The extension has no term on record; one year is assumed.",
};

export type ExtensionTimingState = "PENDING" | "ACTIVE" | "EXPIRED";

export interface ExtensionTiming {
  state: ExtensionTimingState;
  /** Whole-year term at signing. */
  term: number;
  /** Seasons of it still to play counting the current one (PENDING: the full term; EXPIRED: 0). */
  remaining: number;
  /** First season's start year, or null when it cannot be derived. Always derived, never stored. */
  startYear: number | null;
  /** Last season's start year, or null when the start is unknown. */
  endYear: number | null;
  startSeason: string | null;
  endSeason: string | null;
  flags: ExtensionFlag[];
}

/**
 * Where an extension stands in the application's season.
 *
 * `offseasonYear` is the application's season context (the start year of
 * `SEASON.label`) — never a stats-selection year. Given the anchor E (the
 * year the extended deal ends) and term T:
 *
 *   season < E             → PENDING, begins in E
 *   E ≤ season < E + T     → ACTIVE, with E + T − season seasons left
 *   season ≥ E + T         → EXPIRED
 *
 * Without a plausible anchor nothing is derived. The status-based fallback the
 * rest of the pipeline already uses (`fallbackExpired`) can still call it
 * ACTIVE, but with the full term and an ELAPSED_UNKNOWN flag.
 */
export function resolveExtensionTiming(opts: {
  term: number | null | undefined;
  /** Calendar year the extended deal ends. */
  expiryYear: number | null | undefined;
  offseasonYear: number;
  /** Stored term of the current deal, to cross-check the anchor (PENDING only). */
  yearsRemaining?: number | null;
  /** The pipeline's status-based read of "the current deal has ended". */
  fallbackExpired?: boolean;
  signedAt?: string | null;
}): ExtensionTiming {
  const flags: ExtensionFlag[] = [];
  let term = opts.term != null && Number.isFinite(opts.term) && opts.term > 0 ? Math.round(opts.term) : 0;
  if (term === 0) { term = 1; flags.push("TERM_MISSING"); }

  const anchor = plausibleAnchor(opts.expiryYear, opts.offseasonYear);
  if (anchor == null) {
    flags.push("NO_ANCHOR");
    const active = opts.fallbackExpired === true;
    if (active) flags.push("ELAPSED_UNKNOWN");
    return {
      state: active ? "ACTIVE" : "PENDING",
      term, remaining: term, startYear: null, endYear: null, startSeason: null, endSeason: null, flags,
    };
  }

  const startYear = anchor;
  const endYear = anchor + term - 1;
  const state: ExtensionTimingState =
    opts.offseasonYear < startYear ? "PENDING"
    : opts.offseasonYear <= endYear ? "ACTIVE"
    : "EXPIRED";
  const remaining = state === "PENDING" ? term : state === "ACTIVE" ? endYear - opts.offseasonYear + 1 : 0;

  if (
    state === "PENDING" && opts.yearsRemaining != null && opts.yearsRemaining > 0 &&
    anchor - opts.offseasonYear !== Math.round(opts.yearsRemaining)
  ) flags.push("TERM_ANCHOR_MISMATCH");
  if (opts.signedAt && opts.signedAt >= `${startYear}-07-01` ) flags.push("SIGNED_AFTER_START");

  return {
    state, term, remaining, startYear, endYear,
    startSeason: seasonLabelFromStartYear(startYear),
    endSeason: seasonLabelFromStartYear(endYear),
    flags,
  };
}

// ── Preview ──────────────────────────────────────────────────────

export interface ExtensionStored {
  extensionCapHit: number | null;
  extensionYears: number | null;
  extensionSignedAt: string | null;
}

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface ExtensionPreview {
  /** "Current: $3.85M through 2026-27." — null when the current deal is not fully known. */
  currentLine: string | null;
  extensionLine: string | null;
  statusLine: string | null;
  /** The columns this save would write. */
  changes: FieldChange[];
  /** Columns a save leaves exactly as they are, shown so nobody has to wonder. */
  unchanged: FieldChange[];
  timing: ExtensionTiming | null;
  flags: ExtensionFlag[];
  errors: string[];
  /** Total and AAV both, for a "= $12.5M annually" counterpart readout. */
  parsed: ParsedExtension | null;
}

const show = (v: string | number | null | undefined, unit = ""): string =>
  v == null || v === "" ? "(none)" : `${v}${unit}`;

/**
 * What saving this extension would do, field by field.
 *
 * `signedAt` is `undefined` when the operator has not touched the date — the
 * stored one is then preserved untouched, known or not — `null` to clear it to
 * unknown, or a validated YYYY-MM-DD string to set it.
 */
export function buildExtensionPreview(args: {
  current: {
    capHit: number | null;
    yearsRemaining: number | null;
    expiryYear: number | null;
    expiryStatus?: string | null;
  };
  stored: ExtensionStored | null;
  input: { mode: ExtensionInputMode; value: unknown; years: unknown };
  signedAt: string | null | undefined;
  offseasonYear: number;
  now?: Date | number;
}): ExtensionPreview {
  const parsed = parseExtensionInput(args.input);
  const errors: string[] = parsed.ok ? [] : [...parsed.errors];

  let signedAtValue: string | null | undefined = args.signedAt;
  if (typeof signedAtValue === "string") {
    const v = validateSigningDate(signedAtValue, args.now);
    if (!v.ok) { errors.push(v.error); signedAtValue = undefined; }
  }

  const { current, stored } = args;
  const anchor = plausibleAnchor(current.expiryYear, args.offseasonYear);
  const currentLine = current.capHit != null && anchor != null
    ? `Current: ${formatMillions(current.capHit)} through ${seasonLabelFromStartYear(anchor - 1)}.`
    : current.capHit != null
      ? `Current: ${formatMillions(current.capHit)}; expiry year unknown.`
      : null;

  if (!parsed.ok) {
    return { currentLine, extensionLine: null, statusLine: null, changes: [], unchanged: [], timing: null, flags: [], errors, parsed };
  }

  const effectiveSigned = signedAtValue === undefined ? (stored?.extensionSignedAt ?? null) : signedAtValue;
  const timing = resolveExtensionTiming({
    term: parsed.years,
    expiryYear: current.expiryYear,
    offseasonYear: args.offseasonYear,
    yearsRemaining: current.yearsRemaining,
    signedAt: effectiveSigned,
  });

  const extensionLine = timing.startSeason && timing.endSeason
    ? `Extension: ${formatMillions(parsed.aav)} annually, ${timing.startSeason} through ${timing.endSeason} (${parsed.years} year${parsed.years === 1 ? "" : "s"}, ${formatMillions(parsed.total)} total).`
    : `Extension: ${formatMillions(parsed.aav)} annually for ${parsed.years} year${parsed.years === 1 ? "" : "s"} (${formatMillions(parsed.total)} total); start season cannot be derived.`;

  const statusLine = timing.startYear == null
    ? "Status: signed; start season unknown — the current contract needs an expiry year."
    : timing.state === "PENDING"
      ? `Status: signed, starts ${timing.startYear - args.offseasonYear === 1 ? "next season" : `in ${timing.startSeason}`}.`
      : timing.state === "ACTIVE"
        ? `Status: signed, active now — ${timing.remaining} season${timing.remaining === 1 ? "" : "s"} left.`
        : "Status: signed, but its final season has already passed.";

  const changes: FieldChange[] = [];
  const pushIf = (field: string, from: string, to: string) => { if (from !== to) changes.push({ field, from, to }); };
  pushIf("extensionCapHit ($M, annual)", show(stored?.extensionCapHit), String(parsed.aav));
  pushIf("extensionYears", show(stored?.extensionYears), String(parsed.years));
  if (signedAtValue !== undefined) pushIf("extensionSignedAt", show(stored?.extensionSignedAt), show(signedAtValue));

  const unchanged: FieldChange[] = [
    { field: "capHit ($M)", from: show(current.capHit), to: show(current.capHit) },
    { field: "yearsRemaining", from: show(current.yearsRemaining), to: show(current.yearsRemaining) },
    { field: "expiryYear", from: show(current.expiryYear), to: show(current.expiryYear) },
    { field: "expiryStatus", from: show(current.expiryStatus ?? null), to: show(current.expiryStatus ?? null) },
    { field: "team, clauses, roster flags", from: "unchanged", to: "unchanged" },
  ];
  if (signedAtValue === undefined) {
    unchanged.push({ field: "extensionSignedAt", from: show(stored?.extensionSignedAt), to: show(stored?.extensionSignedAt) });
  }

  return { currentLine, extensionLine, statusLine, changes, unchanged, timing, flags: timing.flags, errors, parsed };
}
