import { firstNameRoot } from "@/app/lib/player-identity";

export interface SearchablePlayer {
  id?: string;
  name: string;
  teamId?: string;
}

export interface SearchableTeam {
  id?: string;
  name?: string;
  aliases?: readonly string[];
}

/** One query key for accents, apostrophes, punctuation, and hyphens. */
export function normalizeSearchText(value: string): string {
  return String(value ?? "")
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const compact = (value: string): string => value.replace(/\s/g, "");

const rootedName = (value: string): string => {
  const words = normalizeSearchText(value).split(" ").filter(Boolean);
  if (words.length < 2) return words.join(" ");
  words[0] = firstNameRoot(words[0]);
  return words.join(" ");
};

const addForms = (target: Set<string>, value: string): void => {
  const normalized = normalizeSearchText(value);
  if (!normalized) return;
  target.add(normalized);
  target.add(compact(normalized));
};

export function playerSearchAliases(
  player: SearchablePlayer,
  team?: SearchableTeam | string | null,
): Set<string> {
  const aliases = new Set<string>();
  addForms(aliases, player.name);
  addForms(aliases, rootedName(player.name));
  addForms(aliases, player.teamId ?? "");

  if (typeof team === "string") {
    addForms(aliases, team);
  } else if (team) {
    addForms(aliases, team.id ?? "");
    addForms(aliases, team.name ?? "");
    for (const alias of team.aliases ?? []) addForms(aliases, alias);
  }

  return aliases;
}

export function matchesPlayerSearch(
  player: SearchablePlayer,
  query: string,
  team?: SearchableTeam | string | null,
): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;

  const queries = new Set<string>();
  addForms(queries, normalized);
  addForms(queries, rootedName(normalized));
  const aliases = playerSearchAliases(player, team);

  return [...queries].some(candidate =>
    [...aliases].some(alias => alias.includes(candidate))
  );
}

export function filterPlayersBySearch<T extends SearchablePlayer>(
  players: readonly T[],
  query: string,
  teamFor?: (player: T) => SearchableTeam | string | null | undefined,
): T[] {
  if (!normalizeSearchText(query)) return [...players];
  return players.filter(player => matchesPlayerSearch(player, query, teamFor?.(player)));
}
