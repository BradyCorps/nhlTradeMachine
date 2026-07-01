const NAME_ALIASES: Record<string, string> = {
  "alex ovechkin": "Alexander Ovechkin",
  "dmitriy simashev": "Dmitri Simashev",
};

export function canonicalName(name: string): string {
  return NAME_ALIASES[name.toLowerCase()] ?? name;
}

export const canonicalNameSlug = (name: string): string =>
  canonicalName(name).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");

export function makePlayerId(name: string): string {
  return canonicalName(name).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export const canonicalPlayerKey = (player: { id?: unknown; name?: unknown }): string => {
  const id = player.id == null ? "" : String(player.id).trim();
  if (id) return `id:${id}`;
  const name = typeof player.name === "string" ? canonicalNameSlug(player.name) : "";
  return name ? `name:${name}` : "";
};

export const safeNhlRosterPlayer = (raw: any): {
  id: string;
  name: string;
  position: string;
  birthDate: string;
  headshot: string | null;
} | null => {
  const id = raw?.id == null ? "" : String(raw.id);
  const first = raw?.firstName?.default;
  const last = raw?.lastName?.default;
  const position = raw?.positionCode;
  const birthDate = raw?.birthDate;
  if (!id || typeof first !== "string" || typeof last !== "string" || typeof position !== "string" || typeof birthDate !== "string") {
    return null;
  }
  return {
    id,
    name: `${first} ${last}`,
    position,
    birthDate,
    headshot: raw?.headshot ?? null,
  };
};

export function removePlayerFromOtherRosters(
  rosterMap: Map<string, any[]>,
  targetTeamId: string,
  player: { id?: unknown; name?: unknown },
): void {
  const id = player.id == null ? "" : String(player.id);
  const slug = typeof player.name === "string" ? canonicalNameSlug(player.name) : "";
  for (const [teamId, list] of rosterMap.entries()) {
    if (teamId === targetTeamId) continue;
    rosterMap.set(teamId, list.filter(existing => {
      const existingId = existing?.id == null ? "" : String(existing.id);
      const existingSlug = typeof existing?.name === "string" ? canonicalNameSlug(existing.name) : "";
      return !(id && existingId === id) && !(slug && existingSlug === slug);
    }));
  }
}

export function dedupePlayersByAuthority<T extends { id?: unknown; name?: unknown; teamId?: string; injectedFromDb?: boolean }>(
  players: T[],
  dbTeamBySlug = new Map<string, string>(),
): T[] {
  const best = new Map<string, T>();
  for (const player of players) {
    const idKey = canonicalPlayerKey(player);
    const slug = typeof player.name === "string" ? canonicalNameSlug(player.name) : "";
    const key = idKey || (slug ? `name:${slug}` : "");
    if (!key) continue;
    const preferredTeamId = slug ? dbTeamBySlug.get(slug) : undefined;
    const current = best.get(key);
    if (!current) {
      best.set(key, player);
      continue;
    }
    const currentPref = preferredTeamId != null && current.teamId === preferredTeamId;
    const nextPref = preferredTeamId != null && player.teamId === preferredTeamId;
    if ((nextPref && !currentPref) || (player.injectedFromDb && !current.injectedFromDb)) {
      best.set(key, player);
    }
  }
  return [...best.values()];
}
