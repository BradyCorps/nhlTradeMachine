// ── league-imagery.ts ────────────────────────────────────────────
//
// URL builders for the two pieces of league imagery the SITE displays:
// player mugshots and club logos, both served by the NHL's own public asset
// host and hotlinked from there.
//
// THE POLICY, AND WHY IT IS ASYMMETRIC
//
//   Site  — allowed. Hotlinking shows the league's image, from the league's
//           server, in the context it was published for. Nothing is copied,
//           cached or rehosted; if the NHL pulls a file it disappears here too.
//   Export— never. The downloadable PNG is a branded artefact built to travel,
//           and baking a copy of league imagery into it is redistribution.
//
// That boundary is structural rather than a rule someone has to remember: the
// export renders server-side from `CardData`, which has no image field, and it
// draws `playerAvatarSvgMarkup` — a drawn bust — instead. Nothing in this file
// is reachable from `app/api/card-image`. `__tests__/feature-canaries.test.ts`
// holds that line.
//
// Every URL here is a CANDIDATE, not a promise. A mug exists only for the
// season/club a player actually dressed for, so consumers walk the candidate
// list on `onError` and land on the drawn mark when none resolves. No request
// is ever made from our servers.

import { SEASON } from "@/app/lib/season-config";

export const NHL_ASSET_HOST = "https://assets.nhle.com";

/** NHL player ids are 7-8 digit integers. Ours are name slugs for DB-only
 *  rows (prospects, bulk FAs), and those have no mug — reject them here so a
 *  slug never becomes a guaranteed-404 request. */
const NHL_PLAYER_ID = /^[0-9]{7,8}$/;

/** Club codes are the three-letter NHL abbreviations we already key teams by. */
const TEAM_CODE = /^[A-Z]{3}$/;

export const isNhlPlayerId = (id: unknown): boolean =>
  NHL_PLAYER_ID.test(String(id ?? "").trim());

export const isTeamCode = (id: unknown): boolean =>
  TEAM_CODE.test(String(id ?? "").trim());

/** True only for URLs served by the league's public asset host over https. */
export const isNhlAssetUrl = (url: unknown): boolean =>
  typeof url === "string" && url.startsWith(`${NHL_ASSET_HOST}/`);

/**
 * A mugshot for one player, in one season, on one club.
 *
 * `https://assets.nhle.com/mugs/nhl/20262027/WPG/8476392.png`
 *
 * Returns null rather than a broken URL when either key is not of the shape
 * the host uses — a caller that renders null gets the drawn mark instead.
 */
export function mugUrl(
  playerId: unknown,
  teamCode: unknown,
  seasonId: string,
): string | null {
  if (!isNhlPlayerId(playerId) || !isTeamCode(teamCode)) return null;
  if (!/^[0-9]{8}$/.test(seasonId)) return null;
  return `${NHL_ASSET_HOST}/mugs/nhl/${seasonId}/${String(teamCode).trim()}/${String(playerId).trim()}.png`;
}

/**
 * The seasons a mug is worth trying, newest first.
 *
 * The projected season is the one the app is playing in, but its mugs only
 * appear once the league publishes them; the last completed season always has
 * a full set. Deduped, because in September those two constants are equal.
 */
export const MUG_SEASONS: readonly string[] = Array.from(
  new Set<string>([SEASON.apiSeasonId, SEASON.nhleSeasonId]),
);

export interface HeadshotSubject {
  /** NHL player id where we have one; DB-only rows carry a name slug. */
  id?: unknown;
  /** Three-letter club code. */
  teamId?: unknown;
  /** Exact URL from the NHL roster feed, when that feed covered this player. */
  headshot?: string | null;
}

/**
 * Ordered mug candidates for one player.
 *
 * The feed's own URL leads: it is the league's answer for this player and is
 * already correct for whichever club and season it was minted against, which
 * matters in Armchair GM where `teamId` moves the moment a trade executes and
 * no mug exists for the new club. Derived URLs follow as the fallback for
 * players the roster feed never covered.
 *
 * Anything not on the league's host is dropped — a DB row must not be able to
 * point the page at an arbitrary third-party image.
 */
export function headshotCandidates(subject: HeadshotSubject): string[] {
  const out: string[] = [];
  const push = (url: string | null) => {
    if (url && !out.includes(url)) out.push(url);
  };
  if (isNhlAssetUrl(subject.headshot)) push(subject.headshot as string);
  for (const season of MUG_SEASONS) push(mugUrl(subject.id, subject.teamId, season));
  return out;
}

/**
 * Ordered club-logo candidates.
 *
 * The paper is cream, so the light-background variant leads. `_dark` follows
 * because a handful of clubs publish only one of the pair, and the abbreviation
 * mark backs both up.
 */
export function teamLogoCandidates(teamCode: unknown): string[] {
  if (!isTeamCode(teamCode)) return [];
  const code = String(teamCode).trim();
  return [
    `${NHL_ASSET_HOST}/logos/nhl/svg/${code}_light.svg`,
    `${NHL_ASSET_HOST}/logos/nhl/svg/${code}_dark.svg`,
  ];
}

/**
 * Which candidate to show, given how many have already failed to load.
 *
 * Pure so the fallback walk is testable and so consumers can derive it during
 * render instead of holding an index that goes stale when the row is reused
 * for a different player.
 */
export function candidateAt(candidates: string[], failures: number): string | null {
  if (failures < 0) return candidates[0] ?? null;
  return candidates[failures] ?? null;
}
