// ── release-gates.ts ─────────────────────────────────────────────
//
// DATA-06: named, independently-reportable checks — not one lumped
// pass/fail — so "a failed domain can be diagnosed without marking the
// whole product Live." Every gate here wraps an invariant DATA-01 through
// DATA-05 already established (or, where none existed, states one worth
// having) as a pure function over plain data: no DB, no network, so a gate
// can run anywhere a manifest is assembled — a route, an admin panel, a
// test — without pulling in roster assembly's heavy dependency graph.
//
// A gate never mutates and never throws on bad input; it reports.

import { canonicalNameSlug, makePlayerId } from "@/app/lib/player-identity";
import { rosterLegality, type RosterLegality } from "@/app/lib/roster-legality";
import { retentionCheck, type RetentionEntry } from "@/app/lib/retention-ledger";
import { applyCapDelta, type CapDeltaMoves } from "@/app/lib/cap-delta";

export interface GateResult {
  gate: string;
  passed: boolean;
  detail: string;
}

// ── Exact-name/alias invariance by NHL ID ──────────────────────────────────
// Two different NHL IDs must never collapse to the same canonical identity —
// that is the accidental-duplicate-record failure mode DATA-04's Björck/
// Bjorck reconciliation exists to prevent, stated as a general invariant.
//
// Run against a real production export (1,640 players, Aug 31 2026), this
// correctly caught "elias-pettersson" — but that collision is real and
// deliberate: two different NHL players share the name (a center and a
// defenseman), and `build-league-seed.ts`'s `SAME_NAME_ADDITIONS` exists
// specifically to keep both as distinct, position-salted rows rather than
// collapsing them. `knownCollisions` lets a caller name that one slug as
// reviewed and accepted, so the gate keeps catching every OTHER accidental
// duplicate without asserting a fact about the real world (two humans can
// share a name) that isn't actually broken.
export function exactNameAliasInvariance(
  records: { nhlId: string | number; name: string }[],
  knownCollisions: ReadonlySet<string> = new Set(),
): GateResult {
  const slugToIds = new Map<string, Set<string>>();
  for (const r of records) {
    const slug = canonicalNameSlug(r.name);
    if (!slug) continue;
    const id = String(r.nhlId);
    if (!slugToIds.has(slug)) slugToIds.set(slug, new Set());
    slugToIds.get(slug)!.add(id);
  }
  const collisions = [...slugToIds.entries()]
    .filter(([slug, ids]) => ids.size > 1 && !knownCollisions.has(slug));
  return {
    gate: "exact-name-alias-invariance",
    passed: collisions.length === 0,
    detail: collisions.length === 0
      ? `${records.length} records, ${slugToIds.size} distinct identities; no unreviewed name resolves to more than one NHL ID.`
      : `${collisions.length} name(s) resolve to more than one NHL ID: ${collisions.slice(0, 3).map(([slug]) => slug).join(", ")}.`,
  };
}

/** The canonical id two differently-spelled names for the same real person should share. */
export const canonicalIdentityId = makePlayerId;

// ── Cross-surface value reconciliation ─────────────────────────────────────
// DATA-02's content-addressed snapshot id is the mechanism; this gate states
// the property it exists to guarantee — every surface holding the same
// player+day produces the identical snapshot.
export function crossSurfaceValueReconciliation(
  snapshots: { playerId: string; snapshotId: string; total: number }[],
): GateResult {
  const byPlayer = new Map<string, { snapshotId: string; total: number }[]>();
  for (const s of snapshots) {
    if (!byPlayer.has(s.playerId)) byPlayer.set(s.playerId, []);
    byPlayer.get(s.playerId)!.push(s);
  }
  const disagreements: string[] = [];
  for (const [playerId, rows] of byPlayer) {
    const ids = new Set(rows.map((r) => r.snapshotId));
    if (ids.size > 1) disagreements.push(playerId);
  }
  return {
    gate: "cross-surface-value-reconciliation",
    passed: disagreements.length === 0,
    detail: disagreements.length === 0
      ? `${byPlayer.size} player(s) reconcile to one snapshot id across every surface that reported them.`
      : `${disagreements.length} player(s) reported more than one snapshot id: ${disagreements.slice(0, 3).join(", ")}.`,
  };
}

// ── Contract/status/age invariants ─────────────────────────────────────────
// DATA-01's rule, restated as a checkable gate: never a negative age, and
// never an asserted RFA/UFA class with no year behind it.
//
// A first version of this gate also flagged `expiryStatus` set alongside an
// `expiryYear` later than the current offseason — reasoning that a class
// that "hasn't happened yet" must be fabricated. Running it against a real
// production export (1,640 players, Aug 31 2026) proved that wrong: Ian
// Cole (DATA-03's own verified fix — signed through 2026-27, UFA in 2027)
// and the seeded Elias Pettersson defenseman both failed it, because a
// player can be genuinely signed now with a real, known future free-agent
// class — that is the entire point of the expiry-by-year ledger (DATA-03),
// not a contradiction. The gate was checking the wrong direction: DATA-01's
// actual bug (Korchinski) paired a MISSING status with a stale-looking term,
// not a present status with a future year. Missing the year while claiming
// the status is the one direction that is unambiguously an incomplete fact
// (found live: Zack Bolduc — `RFA`, no `expiryYear`) — the only conditions
// this gate is now allowed to assert as a real invariant of the data.
export function contractStatusAgeInvariant(
  players: { id: string; age?: number | null; expiryStatus?: string | null; expiryYear?: number | null; offseasonYear: number }[],
): GateResult {
  const violations: string[] = [];
  for (const p of players) {
    if (p.age != null && p.age < 0) violations.push(`${p.id}: negative age`);
    const pending = p.expiryStatus === "RFA" || p.expiryStatus === "UFA";
    if (pending && p.expiryYear == null) {
      violations.push(`${p.id}: ${p.expiryStatus} with no expiryYear — an incomplete free-agent fact`);
    }
  }
  return {
    gate: "contract-status-age-invariant",
    passed: violations.length === 0,
    detail: violations.length === 0
      ? `${players.length} player(s) checked; no incomplete free-agent status and no negative age.`
      : `${violations.length} violation(s): ${violations.slice(0, 3).join("; ")}.`,
  };
}

// ── Team population and lineup invariants ──────────────────────────────────
// DATA-03's 12F/6D/2G accounting, aggregated league-wide.
export function teamPopulationLineupInvariant(
  legalities: Record<string, RosterLegality>,
): GateResult {
  const teamIds = Object.keys(legalities);
  const illegal = teamIds.filter((id) => !legalities[id].legal);
  return {
    gate: "team-population-lineup-invariant",
    passed: illegal.length === 0,
    detail: illegal.length === 0
      ? `${teamIds.length} team(s) can each ice a legal 12F/6D/2G lineup.`
      : `${illegal.length} team(s) cannot ice a legal lineup: ${illegal.slice(0, 5).join(", ")}.`,
  };
}

// ── Cap/pick reconciliation ─────────────────────────────────────────────────
// DATA-05's shared delta function: a team's before/after cap total must
// reconcile to its own components, and no proposed retention may exceed the
// CBA's slot/percentage/aggregate limits.
export function capPickReconciliation(
  teams: { id: string; capSpaceBefore: number; capSpaceAfter: number; moves: CapDeltaMoves }[],
): GateResult {
  const drift: string[] = [];
  for (const t of teams) {
    const expected = applyCapDelta(t.capSpaceBefore, t.moves);
    if (Math.abs(expected - t.capSpaceAfter) > 0.05) {
      drift.push(`${t.id}: displayed $${t.capSpaceAfter.toFixed(1)}M vs reconciled $${expected.toFixed(1)}M`);
    }
  }
  return {
    gate: "cap-pick-reconciliation",
    passed: drift.length === 0,
    detail: drift.length === 0
      ? `${teams.length} team(s) reconcile their displayed after-cap total to the same delta function.`
      : `${drift.length} team(s) drifted from the reconciled total: ${drift.slice(0, 3).join("; ")}.`,
  };
}

export function retentionSlotGate(
  proposals: { teamId: string; ledger: RetentionEntry[]; proposed: { playerId: string; playerName: string; pct: number; capHit: number; yearsRemaining: number }[]; capCeiling: number }[],
): GateResult {
  const violations: string[] = [];
  for (const p of proposals) {
    const result = retentionCheck(p.ledger, p.proposed, p.capCeiling);
    if (!result.ok) violations.push(`${p.teamId}: ${result.reason}`);
  }
  return {
    gate: "retention-slot-gate",
    passed: violations.length === 0,
    detail: violations.length === 0
      ? `${proposals.length} team(s) proposed retention within the CBA's slot, percentage, and aggregate limits.`
      : `${violations.length} team(s) exceed a retention rule: ${violations.slice(0, 3).join("; ")}.`,
  };
}

// ── Missing-data uncertainty behavior ───────────────────────────────────────
// DATA-02's rule: missing inputs widen uncertainty (or are absent), never a
// fabricated interval or a surplus computed against a value that does not
// exist.
export function missingDataUncertaintyInvariant(
  snapshots: { playerId: string; marketValue: number | null; surplus: number | null; uncertainty: { low: number; high: number } | null }[],
): GateResult {
  const violations: string[] = [];
  for (const s of snapshots) {
    if (s.marketValue == null && (s.uncertainty != null || s.surplus != null)) {
      violations.push(`${s.playerId}: no market value but a surplus or uncertainty band was reported anyway`);
    }
  }
  return {
    gate: "missing-data-uncertainty-invariant",
    passed: violations.length === 0,
    detail: violations.length === 0
      ? `${snapshots.length} snapshot(s) checked; nothing asserts a surplus or interval with no market value behind it.`
      : `${violations.length} violation(s): ${violations.slice(0, 3).join("; ")}.`,
  };
}

// ── No future-information leakage in historical or simulated as_of states ──
// A record dated on or before `asOf` may never carry an input timestamped
// after it — the general shape of "the simulation must not know things that
// have not happened yet by the date it claims to represent."
export function noFutureInformationLeakage(
  asOf: string,
  inputs: { label: string; timestamp: string | null | undefined }[],
): GateResult {
  const asOfTime = Date.parse(asOf);
  if (!Number.isFinite(asOfTime)) {
    return { gate: "no-future-information-leakage", passed: false, detail: `asOf "${asOf}" is not a parseable date.` };
  }
  const leaks = inputs.filter((i) => {
    const t = i.timestamp != null ? Date.parse(i.timestamp) : NaN;
    return Number.isFinite(t) && t > asOfTime;
  });
  return {
    gate: "no-future-information-leakage",
    passed: leaks.length === 0,
    detail: leaks.length === 0
      ? `${inputs.length} input(s) checked against as_of ${asOf}; none postdate it.`
      : `${leaks.length} input(s) postdate as_of ${asOf}: ${leaks.slice(0, 3).map((l) => l.label).join(", ")}.`,
  };
}
