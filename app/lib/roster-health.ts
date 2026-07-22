// ── Roster payload health check ──────────────────────────────────
// Guards the /api/league/players result cache: only a payload whose
// point-shares (OPS/DPS) actually loaded is worth caching. Otherwise a
// flaky NHL stats fetch would pin an OPS/DPS-less roster for the whole
// cache window — the exact blank-OPS/DPS symptom this protects against.

export function isHealthyRoster(players: Array<{ position?: string; ops?: unknown; dps?: unknown }>): boolean {
  const skaters = players.filter((p) => p.position !== "Pick" && p.position !== "G");
  if (skaters.length < 100) return false;
  const withPs = skaters.filter((p) => p.ops != null || p.dps != null).length;
  return withPs >= skaters.length * 0.5;
}
