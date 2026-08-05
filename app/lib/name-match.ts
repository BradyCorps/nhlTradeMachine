// ── name-match.ts ────────────────────────────────────────────────
//
// Decide whether a name from outside the system is somebody the system
// already knows under a different spelling.
//
// WHY THIS HAS TO EXIST
//
// Two sources of the same league disagree about names constantly, and each
// one is right in its own way:
//
//   Egor Chinakhov      / Yegor Chinakhov      — no correct romanisation
//   Nick Paul           / Nicholas Paul        — common vs formal
//   Samuel Montembeault / Sam Montembeault     — the same, the other way round
//
// The exact-id path (`makePlayerId`) sees three pairs of different people.
// When a pasted contract lands on a name the DB has never seen, the ingest
// does not fail — it INSERTS. So a mis-match is not a missing update, it is
// a duplicate player carrying a real cap hit, which is a worse thing to have
// than a gap because nothing downstream reports it.
//
// WHAT IT WILL AND WILL NOT DO ON ITS OWN
//
// Only two tiers are safe to apply without being looked at: an exact id, and
// an exact surname with a first name that is a KNOWN variant of the other.
// Both are the same person or nobody.
//
// Everything below that is a suggestion with a tier attached, because the
// failure it guards against is real: Newhook and Newhook on one team could be
// two brothers, and writing a contract onto the wrong one is silent. So the
// looser tiers come back marked `confirm` or `ambiguous`, and the caller is
// expected to put a human in front of them. Nothing in this file writes, and
// nothing in it picks for you below the auto line.

import { canonicalNameSlug, makePlayerId, firstNameRoot, nicknameMergeKey } from "@/app/lib/player-identity";

export type MatchTier =
  /** Same id. The same person, or the system is already broken. */
  | "exact"
  /** Same surname, first names are known variants of one another. */
  | "variant"
  /** Same team and surname, first names look like each other. */
  | "sameTeamNear"
  /** Same team and surname, first names do not. Could be brothers. */
  | "sameTeamSurname"
  /** Same team, surname is a near-miss — a typo or a second romanisation. */
  | "nearSurname";

/** What the caller should do with a match, which is the only thing the UI needs. */
export type MatchAction = "auto" | "confirm" | "ambiguous";

const TIER_ACTION: Record<MatchTier, MatchAction> = {
  exact: "auto",
  variant: "auto",
  sameTeamNear: "confirm",
  sameTeamSurname: "ambiguous",
  nearSurname: "ambiguous",
};

const TIER_ORDER: MatchTier[] = ["exact", "variant", "sameTeamNear", "sameTeamSurname", "nearSurname"];

const TIER_WHY: Record<MatchTier, string> = {
  exact: "already in the system under this exact name",
  variant: "same surname, and the first names are known spellings of one another",
  sameTeamNear: "same team and surname, and the first names are one or two letters apart",
  sameTeamSurname: "same team and surname, but the first names are unrelated — could be two players",
  nearSurname: "same team, and the surname is a near-miss",
};

export interface NameCandidate {
  name: string;
  team?: string | null;
  /**
   * The row's own id, where the caller has one. Two rows can share a name and
   * be two people — Vancouver really does carry two Elias Petterssons, a
   * centre and a defenceman — and only the id tells them apart.
   */
  id?: string | null;
  /** Something to tell two identically-named players apart in a picker. */
  hint?: string | null;
}

export interface NameMatch {
  /** The name as the system spells it — the key an ingest should use. */
  name: string;
  tier: MatchTier;
  action: MatchAction;
  why: string;
  /** The candidate's hint, carried through so a picker can show it. */
  hint?: string | null;
}

export interface NameResolution {
  /** Best match, or null when nothing plausible was found. */
  match: NameMatch | null;
  /** What to do: `auto` applies, the rest want a human. `none` means new. */
  action: MatchAction | "none";
  /** Other plausible names, best first, for a picker. Never includes `match`. */
  alternatives: NameMatch[];
}

/** Levenshtein, capped — past the cap the exact distance stops mattering. */
export function editDistance(a: string, b: string, cap = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Split a name into a first name and everything after it.
 *
 * The slug drops punctuation before splitting, so a hyphenated first name
 * stays one token: "Pierre-Luc Dubois" → { first: "pierreluc", last: "dubois" }.
 * That is what we want — the surname is the part the tiers lean on hardest.
 */
export function splitName(name: string): { first: string; last: string } {
  const slug = canonicalNameSlug(name);
  const dash = slug.indexOf("-");
  if (dash < 0) return { first: "", last: slug };
  return { first: slug.slice(0, dash), last: slug.slice(dash + 1) };
}

const sameTeam = (a?: string | null, b?: string | null): boolean =>
  Boolean(a && b && a.trim().toUpperCase() === b.trim().toUpperCase());

/** Which tier, if any, a single candidate reaches. */
function tierFor(
  pasted: { name: string; team?: string | null },
  candidate: NameCandidate,
): MatchTier | null {
  if (makePlayerId(pasted.name) === makePlayerId(candidate.name)) return "exact";

  const p = splitName(pasted.name);
  const c = splitName(candidate.name);
  if (!p.last || !c.last) return null;

  const rootsAgree = Boolean(p.first) && firstNameRoot(p.first) === firstNameRoot(c.first);
  if (p.last === c.last && rootsAgree) return "variant";

  // Below here a shared team is required. Without it, a one-letter first-name
  // gap is as likely to be two people (Ryan and Bryan Smith) as one.
  if (!sameTeam(pasted.team, candidate.team)) return null;

  if (p.last === c.last) {
    const near = p.first[0] === c.first[0] || editDistance(p.first, c.first, 2) <= 2;
    return near ? "sameTeamNear" : "sameTeamSurname";
  }

  if (editDistance(p.last, c.last, 2) <= 2 && (rootsAgree || p.first[0] === c.first[0])) {
    return "nearSurname";
  }

  return null;
}

/**
 * Resolve one pasted name against the names the system already holds.
 *
 * Two candidates tying at the best tier is reported as ambiguous rather than
 * resolved to whichever came first in the array. An arbitrary pick would be
 * indistinguishable from a correct one at the call site.
 */
export function resolvePastedName(
  pasted: { name: string; team?: string | null },
  candidates: NameCandidate[],
): NameResolution {
  const hits: NameMatch[] = [];
  for (const candidate of candidates) {
    const tier = tierFor(pasted, candidate);
    if (!tier) continue;
    hits.push({
      name: candidate.name, tier, action: TIER_ACTION[tier], why: TIER_WHY[tier],
      hint: candidate.hint ?? candidate.team ?? null,
    });
  }

  if (hits.length === 0) return { match: null, action: "none", alternatives: [] };

  hits.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
    || a.name.localeCompare(b.name));

  const best = hits[0];
  const tied = hits.filter(h => h.tier === best.tier).length > 1;

  return {
    match: best,
    // A tie at the top means the tier's own confidence is beside the point:
    // whatever it says, we cannot tell which of the two it means.
    action: tied ? "ambiguous" : best.action,
    alternatives: hits.slice(1, 5),
  };
}

/**
 * Resolve a whole paste at once.
 *
 * Returned keyed by the pasted name, because that is what the caller has in
 * hand and it is what the UI has to label the row with.
 */
export function resolvePastedNames(
  pasted: { name: string; team?: string | null }[],
  candidates: NameCandidate[],
): Map<string, NameResolution> {
  const out = new Map<string, NameResolution>();
  for (const p of pasted) out.set(p.name, resolvePastedName(p, candidates));
  return out;
}

// ── The server-side net ──────────────────────────────────────────
//
// The panel above is where reconciliation is supposed to happen, with a human
// looking at it. This is what stands behind it: an index over the names a
// table already holds, answering only the two tiers that are safe without a
// human, in constant time per lookup rather than a scan.
//
// It exists because the ingest's failure mode is an insert. Any caller that
// skips the panel — a script, a re-post, a future importer — would otherwise
// quietly grow a second Yegor Chinakhov, and nothing downstream would report
// it. There is no team here, deliberately: a bulk caller has no human to ask,
// so it gets the tiers that need no asking and nothing else.

export interface NameIndex {
  /** Derived id → the names of every DISTINCT player deriving it. */
  byId: Map<string, string[]>;
  byVariant: Map<string, string[]>;
}

/**
 * Index the names a table holds, one entry per PLAYER rather than per string.
 *
 * Both halves of that sentence are load-bearing, and they pull opposite ways:
 *
 * ONE ENTRY PER PLAYER. The live table carries "Alexis Lafreniere" beside
 * "Alexis Lafrenière", and "J.T. Miller" beside "JT Miller". The id strips
 * accents and dots, so those are one player written twice. Counting them as
 * two would make every near-miss on that surname report as a conflict and
 * refuse to write, over a fight that does not exist.
 *
 * PER PLAYER, NOT PER NAME. Vancouver carries two Elias Petterssons — a centre
 * and a defenceman, different people, one spelling. Collapsing them would let
 * a paste write the defenceman's deal onto the centre without a word. Pass the
 * rows' own ids and they stay two, and any lookup landing on them is refused.
 *
 * So: rows are the same player when their given ids match, and when no ids are
 * given, when their derived ids match. Callers that have ids should pass them.
 */
export function buildNameIndex(rows: Iterable<string | NameCandidate>): NameIndex {
  const byId = new Map<string, string[]>();
  const byVariant = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const row of rows) {
    const name = typeof row === "string" ? row : row.name;
    if (!name) continue;
    const derived = makePlayerId(name);
    const player = (typeof row === "string" ? null : row.id) || derived;
    if (seen.has(player)) continue;   // the same player again
    seen.add(player);
    const push = (map: Map<string, string[]>, key: string) => {
      const bucket = map.get(key);
      if (bucket) bucket.push(name);
      else map.set(key, [name]);
    };
    push(byId, derived);
    push(byVariant, nicknameMergeKey(name));
  }
  return { byId, byVariant };
}

export interface IndexHit {
  /** The name to use, or null when there is no safe answer. */
  name: string | null;
  tier: "exact" | "variant" | null;
  /** Populated only when more than one held name is an equally good fit. */
  ambiguous: string[];
}

/**
 * Look one name up against the index.
 *
 * A key matching two held players returns neither — including an EXACT one,
 * which is the two-Petterssons case. Picking one would be a coin toss written
 * into a contract row, and the caller can at least say so.
 */
export function resolveAgainstIndex(name: string, index: NameIndex): IndexHit {
  const exact = index.byId.get(makePlayerId(name)) ?? [];
  if (exact.length === 1) return { name: exact[0], tier: "exact", ambiguous: [] };
  if (exact.length > 1) return { name: null, tier: null, ambiguous: [...exact] };

  const bucket = index.byVariant.get(nicknameMergeKey(name)) ?? [];
  if (bucket.length === 1) return { name: bucket[0], tier: "variant", ambiguous: [] };
  if (bucket.length > 1) return { name: null, tier: null, ambiguous: [...bucket] };
  return { name: null, tier: null, ambiguous: [] };
}
