// ── The free-agent pool ──────────────────────────────────────────
// `FA_POOL` is an internal holding id for players who are unsigned: cut for cap
// reasons, walked in the offseason, or never re-signed. It is NOT a club, and
// must never surface as one — a "ghost team" in a dropdown, an opponent, or a
// trade partner (OFF6). Anything user-facing goes through here.

export const FA_POOL_TEAM_ID = "FA_POOL";

export const isFreeAgent = (p: { teamId?: string | null }): boolean =>
  p.teamId === FA_POOL_TEAM_ID;

/** How a free agent's "team" reads to a user. */
export const FREE_AGENT_LABEL = "Free Agent";

export const teamLabelFor = (teamId: string | null | undefined): string =>
  !teamId ? "—" : teamId === FA_POOL_TEAM_ID ? FREE_AGENT_LABEL : teamId;
