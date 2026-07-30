// ── Trade proposal audit plan (CXH4) ─────────────────────────────
//
// Generating proposals runs a full server-side audit per candidate package.
// Three things were wrong with how that was scheduled.
//
// 1. THE RESULT DEPENDED ON THE NETWORK. Every package from one club shares a
//    single `fitScore` — it is computed once per team and copied onto each of
//    that team's packages — and the de-duplication kept the incumbent unless a
//    challenger scored strictly higher. Among a club's own packages that is
//    never true, so the package that survived was whichever audit RESOLVED
//    FIRST across six concurrent workers. Same block, same league, different
//    proposal.
//
// 2. IT PAID FOR PACKAGES IT WOULD NEVER SHOW. Up to four packages per club
//    were audited, but only one per club is ever displayed. Worse, the audit
//    list was sorted by fit alone, so a handful of high-fit clubs could consume
//    the entire budget with their alternatives while clubs further down were
//    never contacted at all.
//
// 3. A BROKEN AUDIT LOOKED LIKE AN HONEST ANSWER. Every failure was swallowed
//    and returned as "not viable", so a dead network produced the confident
//    message "No realistic trade partners found."
//
// The scheduling rules live here, pure, so they can be tested without a
// network. The component supplies the candidates and performs the fetches.

export interface PlannedCandidate {
  teamId: string;
  teamName: string;
  /** Lower is better. Used only as a tiebreak, never as a filter. */
  standing: number;
  fitScore: number;
  /** Which of this club's packages this is — 0 is the club's preferred one. */
  packageIndex: number;
}

/** Hard ceiling on audits for one generation run. */
export const AUDIT_BUDGET = 36;
/** Requests in flight, and the size of one settled wave. */
export const AUDIT_WAVE = 6;
/**
 * Distinct clubs whose offer has passed, after which further auditing buys
 * nothing the carousel can show. Eight files is already more than anyone reads.
 */
export const TARGET_PARTNERS = 8;

/**
 * Total order over candidates. Total, not partial — any two distinct
 * candidates compare unequal, so nothing is left for arrival order to decide.
 */
export function compareCandidates(a: PlannedCandidate, b: PlannedCandidate): number {
  return b.fitScore - a.fitScore
    || a.packageIndex - b.packageIndex
    || (a.standing ?? 99) - (b.standing ?? 99)
    || a.teamName.localeCompare(b.teamName)
    || a.teamId.localeCompare(b.teamId);
}

/**
 * The order to spend the audit budget in.
 *
 * Breadth first: every club's preferred package is audited before any club's
 * second. Sorting by fit alone let four packages from one club crowd out four
 * clubs, which is the opposite of what a partner search is for — a slightly
 * worse fit at a club you have not contacted beats a fifth variation on one
 * you have.
 */
export function planAuditOrder<T extends PlannedCandidate>(candidates: T[], budget = AUDIT_BUDGET): T[] {
  const byRound = new Map<number, T[]>();
  for (const c of candidates) {
    byRound.set(c.packageIndex, [...(byRound.get(c.packageIndex) ?? []), c]);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  const ordered: T[] = [];
  for (const round of rounds) {
    ordered.push(...byRound.get(round)!.sort(compareCandidates));
  }
  return ordered.slice(0, budget);
}

/**
 * One club, one file. Ties are broken by the same total order, so the surviving
 * package is a property of the league state rather than of the network.
 */
export function bestPerTeam<T extends PlannedCandidate>(verified: T[]): T[] {
  const byTeam = new Map<string, T>();
  for (const candidate of [...verified].sort(compareCandidates)) {
    if (!byTeam.has(candidate.teamId)) byTeam.set(candidate.teamId, candidate);
  }
  return [...byTeam.values()].sort(compareCandidates);
}

/**
 * Whether to stop after a wave has fully settled.
 *
 * Checked only at wave boundaries. Stopping the moment the target is hit would
 * put the cutoff back under the network's control — which candidates happened
 * to be in flight would change what got audited. A boundary is reached after
 * the same number of audits every time.
 */
export function stopAfterWave(distinctTeamsVerified: number, audited: number, total: number): boolean {
  if (audited >= total) return true;
  return distinctTeamsVerified >= TARGET_PARTNERS;
}

export type AuditOutcome =
  | { kind: "PARTNERS" }
  /** Everything that was checked came back a genuine no. */
  | { kind: "NONE_VIABLE"; audited: number }
  /** Some audits never returned an answer, so "no partners" cannot be claimed. */
  | { kind: "INCOMPLETE"; audited: number; failed: number }
  /** Nothing survived pre-screening, so no audit was ever run. */
  | { kind: "NO_CANDIDATES" };

/**
 * What the run actually established.
 *
 * The distinction that matters: a failed audit is not a declined trade. Every
 * error used to be folded into "not viable", so an unreachable API produced a
 * confident "No realistic trade partners found" — the app asserting a fact
 * about the league when it had learned nothing at all.
 */
export function summariseAudit(o: {
  candidates: number;
  audited: number;
  viable: number;
  failed: number;
}): AuditOutcome {
  if (o.viable > 0) return { kind: "PARTNERS" };
  if (o.candidates === 0) return { kind: "NO_CANDIDATES" };
  if (o.failed > 0) return { kind: "INCOMPLETE", audited: o.audited, failed: o.failed };
  return { kind: "NONE_VIABLE", audited: o.audited };
}
