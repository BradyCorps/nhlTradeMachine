const NAME_ALIASES: Record<string, string> = {
  "alex ovechkin": "Alexander Ovechkin",
  "dmitriy simashev": "Dmitri Simashev",
  "john st. ivany": "Jack St. Ivany",
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

// ── Nickname-aware same-team dedup ───────────────────────────────
// Feeds disagree on formal vs common first names: the NHL roster feed
// gives "Matthew Savoie" while a contract/prospect source gives "Matt
// Savoie" — different NHL ids, so the id-keyed dedup above never merges
// them and the same player appears twice on one roster. This maps common
// short forms to their formal root so both collapse to one merge key.
// Deliberately conservative and only ever applied WITHIN one team, where
// two distinct players sharing a last name and a nickname-equivalent first
// name effectively never occurs.
//
// The second half of the table is a different problem with the same shape:
// a Cyrillic first name has no single correct spelling in the Latin
// alphabet, so sources pick different ones and neither is wrong. Егор is
// "Egor" on one page and "Yegor" on another. Those variants do not even
// share a first letter, so nothing short of an explicit table finds them.
const FIRST_NAME_NICKNAMES: Record<string, string> = {
  matt: "matthew", matty: "matthew", matthias: "matthew",
  mike: "michael", mikey: "michael",
  alex: "alexander", alexandre: "alexander", aleksander: "alexander", aleksandr: "alexander",
  nick: "nicholas", nicky: "nicholas",
  chris: "christopher",
  joe: "joseph", joey: "joseph",
  dan: "daniel", danny: "daniel",
  tony: "anthony",
  tom: "thomas", tommy: "thomas",
  will: "william", bill: "william", billy: "william", willie: "william",
  rob: "robert", bob: "robert", bobby: "robert", robby: "robert",
  jake: "jacob",
  josh: "joshua",
  zach: "zachary", zack: "zachary", zac: "zachary",
  ben: "benjamin", benny: "benjamin",
  sam: "samuel", sammy: "samuel",
  jim: "james", jimmy: "james",
  andy: "andrew", drew: "andrew",
  pat: "patrick", paddy: "patrick",
  rick: "richard", ricky: "richard", rich: "richard",
  steve: "steven", stevie: "steven",
  phil: "philip",
  gabe: "gabriel",
  vinny: "vincent", vinnie: "vincent",
  nate: "nathan",
  charlie: "charles",
  freddie: "frederick", fred: "frederick",
  ed: "edward", eddie: "edward",
  greg: "gregory",
  tim: "timothy", timmy: "timothy",
  mitch: "mitchell",
  jon: "jonathan", jonny: "jonathan", johnny: "john",
  kris: "kristopher",
  cal: "calvin",

  // ── Transliterations ───────────────────────────────────────────
  // Same name, different romanisation. The root chosen here is arbitrary;
  // all that matters is that every spelling of one name lands on it.
  egor: "yegor",
  alexei: "aleksei", alexey: "aleksei", aleksey: "aleksei", alexi: "aleksei",
  dmitry: "dmitri", dmitriy: "dmitri", dmitrij: "dmitri",
  sergey: "sergei", serguei: "sergei",
  andrey: "andrei", andrej: "andrei",
  evgeny: "evgeni", evgenii: "evgeni", yevgeni: "evgeni", yevgeny: "evgeni",
  ilia: "ilya", iliya: "ilya",
  matvey: "matvei",
  nikolay: "nikolai", nicolai: "nikolai",
  valery: "valeri", valerii: "valeri",
  vitaly: "vitali", vitalii: "vitali",
  vasily: "vasili", vasiliy: "vasili",
  yury: "yuri",
  maksim: "maxim",
  danil: "daniil",
  artemi: "artem", artyom: "artem", artiom: "artem",
  grigory: "grigori", grigorii: "grigori",
  arseny: "arseni", arsenii: "arseni",
  mihail: "mikhail", michail: "mikhail",
  kiril: "kirill",
  fyodor: "fedor",
  semen: "semyon",
  timofey: "timofei",
};

/** The spelling every variant of a first name collapses to. */
export const firstNameRoot = (first: string): string =>
  FIRST_NAME_NICKNAMES[first] ?? first;

// A team-scoped key that collapses first-name variants ("matt-savoie" and
// "matthew-savoie" → "matthew-savoie") while keeping the last name intact.
export function nicknameMergeKey(name: string): string {
  const slug = canonicalNameSlug(name);
  const dash = slug.indexOf("-");
  if (dash < 0) return slug;
  const first = slug.slice(0, dash);
  const rest = slug.slice(dash + 1);
  return `${FIRST_NAME_NICKNAMES[first] ?? first}-${rest}`;
}

// Which of two records for the same person to keep: the one with the real
// NHL sample and contract wins (more games, then live stats, then a real
// cap hit, then the more complete/formal name).
function preferRecord(a: any, b: any): boolean {
  const ga = a?.games ?? 0, gb = b?.games ?? 0;
  if (ga !== gb) return ga > gb;
  const la = a?.hasLiveStats ? 1 : 0, lb = b?.hasLiveStats ? 1 : 0;
  if (la !== lb) return la > lb;
  const ca = a?.capHit ?? 0, cb = b?.capHit ?? 0;
  if (ca !== cb) return ca > cb;
  return String(a?.name ?? "").length > String(b?.name ?? "").length;
}

export function dedupeSameTeamNicknames<T extends { name?: unknown; teamId?: string; position?: string }>(
  players: T[],
): T[] {
  const best = new Map<string, T>();
  const passthrough: T[] = [];
  for (const player of players) {
    const name = typeof player.name === "string" ? player.name : "";
    const team = player.teamId ?? "";
    // Picks and teamless/nameless rows never merge.
    if (!name || !team || player.position === "Pick") { passthrough.push(player); continue; }
    const key = `${team}::${nicknameMergeKey(name)}`;
    const current = best.get(key);
    if (!current || preferRecord(player, current)) best.set(key, player);
  }
  return [...best.values(), ...passthrough];
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
