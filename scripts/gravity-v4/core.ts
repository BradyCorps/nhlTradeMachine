// ── Gravity v4 — shift/stint reconstruction (pure) ───────────────
//
// Turns NHL shift-chart rows into CONSTANT-LINEUP STINTS: maximal intervals
// during which the exact set of skaters on the ice never changes. A stint is
// the unit of observation the fitted v4 model needs — it is where teammate,
// opponent, strength and zone context are all simultaneously known.
//
// Nothing here performs I/O or joins on names. Player identity is the NHL id
// throughout; names appear only in the optional line-validation report, which
// is explicitly a cross-check against an external file and never a data join.

// ── Types ────────────────────────────────────────────────────────

/** A shift row as returned by api.nhle.com/stats/rest/en/shiftcharts. */
export interface RawShiftRow {
  playerId: number;
  teamId: number;
  period: number;
  startTime: string | null;   // "MM:SS" elapsed within the period
  endTime: string | null;     // "MM:SS" elapsed within the period
  duration?: string | null;   // "MM:SS"; null on non-shift event rows
  typeCode?: number;          // 517 = shift; other codes are goal/event rows
  firstName?: string | null;
  lastName?: string | null;
}

export interface Shift {
  playerId: number;
  teamId: number;
  period: number;
  startSec: number;
  endSec: number;
}

export type PositionCode = "C" | "L" | "R" | "D" | "G";

/** Minimal roster projection taken from the play-by-play `rosterSpots`. */
export interface RosterSpot {
  playerId: number;
  teamId: number;
  positionCode: PositionCode;
  fullName?: string;
}

export interface Stint {
  period: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  homeSkaters: number[];
  awaySkaters: number[];
  homeGoalie: number | null;
  awayGoalie: number | null;
  /** e.g. "5v5", "5v4", "4v5" — always <away>v<home>. */
  strength: string;
  isEven5v5: boolean;
}

export interface ShiftParseReport {
  totalRows: number;
  shiftRows: number;
  nonShiftRows: number;
  duplicateRows: number;
  invalidRows: number;
  unknownPlayerRows: number;
}

// ── Time helpers ─────────────────────────────────────────────────

/** "MM:SS" → seconds. Returns null for missing/garbled values. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const SHIFT_TYPE_CODE = 517;

// ── Shift parsing ────────────────────────────────────────────────

/**
 * Normalise raw shift-chart rows into clean shifts.
 *
 * Drops, and counts separately:
 *  - non-shift rows (goal/event rows share the endpoint),
 *  - rows whose clock will not parse or that end at/before they start,
 *  - exact duplicates (same player, period, start and end),
 *  - rows for players absent from the game roster, when a roster is supplied.
 */
export function parseShifts(
  rows: RawShiftRow[],
  knownPlayerIds?: Set<number>,
): { shifts: Shift[]; report: ShiftParseReport } {
  const report: ShiftParseReport = {
    totalRows: rows.length,
    shiftRows: 0,
    nonShiftRows: 0,
    duplicateRows: 0,
    invalidRows: 0,
    unknownPlayerRows: 0,
  };
  const seen = new Set<string>();
  const shifts: Shift[] = [];

  for (const row of rows) {
    if (row.typeCode != null && row.typeCode !== SHIFT_TYPE_CODE) {
      report.nonShiftRows++;
      continue;
    }
    report.shiftRows++;

    const startSec = parseClock(row.startTime);
    const endSec = parseClock(row.endTime);
    if (startSec == null || endSec == null || endSec <= startSec || row.period == null) {
      report.invalidRows++;
      continue;
    }
    if (knownPlayerIds && !knownPlayerIds.has(row.playerId)) {
      report.unknownPlayerRows++;
      continue;
    }
    const key = `${row.playerId}:${row.period}:${startSec}:${endSec}`;
    if (seen.has(key)) {
      report.duplicateRows++;
      continue;
    }
    seen.add(key);
    shifts.push({
      playerId: row.playerId,
      teamId: row.teamId,
      period: row.period,
      startSec,
      endSec,
    });
  }

  return { shifts, report };
}

// ── Stint construction ───────────────────────────────────────────

/**
 * Build constant-lineup stints.
 *
 * Every shift start and end in a period is a change point. Between two adjacent
 * change points the on-ice set cannot change, so each such interval is one
 * stint. A player is on the ice for interval [t0,t1) when his shift satisfies
 * startSec <= t0 and endSec >= t1 — half-open, so a player leaving exactly at
 * t0 is not counted in the interval beginning at t0.
 */
export function buildStints(
  shifts: Shift[],
  roster: RosterSpot[],
  homeTeamId: number,
): Stint[] {
  const positionById = new Map<number, PositionCode>();
  for (const spot of roster) positionById.set(spot.playerId, spot.positionCode);

  const byPeriod = new Map<number, Shift[]>();
  for (const s of shifts) {
    const list = byPeriod.get(s.period);
    if (list) list.push(s);
    else byPeriod.set(s.period, [s]);
  }

  const stints: Stint[] = [];
  for (const period of [...byPeriod.keys()].sort((a, b) => a - b)) {
    const periodShifts = byPeriod.get(period)!;
    const points = new Set<number>();
    for (const s of periodShifts) { points.add(s.startSec); points.add(s.endSec); }
    const ordered = [...points].sort((a, b) => a - b);

    for (let i = 0; i < ordered.length - 1; i++) {
      const t0 = ordered[i], t1 = ordered[i + 1];
      if (t1 <= t0) continue;

      const homeSkaters: number[] = [];
      const awaySkaters: number[] = [];
      let homeGoalie: number | null = null;
      let awayGoalie: number | null = null;

      for (const s of periodShifts) {
        if (s.startSec > t0 || s.endSec < t1) continue;
        const isHome = s.teamId === homeTeamId;
        if (positionById.get(s.playerId) === "G") {
          if (isHome) homeGoalie = s.playerId; else awayGoalie = s.playerId;
        } else if (isHome) homeSkaters.push(s.playerId);
        else awaySkaters.push(s.playerId);
      }

      homeSkaters.sort((a, b) => a - b);
      awaySkaters.sort((a, b) => a - b);
      const strength = `${awaySkaters.length}v${homeSkaters.length}`;
      stints.push({
        period,
        startSec: t0,
        endSec: t1,
        durationSec: t1 - t0,
        homeSkaters,
        awaySkaters,
        homeGoalie,
        awayGoalie,
        strength,
        isEven5v5:
          homeSkaters.length === 5 && awaySkaters.length === 5 &&
          homeGoalie != null && awayGoalie != null,
      });
    }
  }
  return stints;
}

// ── Strength cross-check against the game's own situationCode ────

/**
 * The play-by-play stamps each event with a 4-digit `situationCode`:
 * away-goalie, away-skaters, home-skaters, home-goalie. Comparing it with the
 * independently reconstructed stint is the strongest available correctness
 * check — the two derive from different endpoints.
 */
export function parseSituationCode(code: string | null | undefined):
  { awaySkaters: number; homeSkaters: number; awayGoalie: boolean; homeGoalie: boolean } | null {
  if (!code || !/^\d{4}$/.test(code)) return null;
  return {
    awayGoalie: code[0] === "1",
    awaySkaters: Number(code[1]),
    homeSkaters: Number(code[2]),
    homeGoalie: code[3] === "1",
  };
}

export function findStintAt(stints: Stint[], period: number, sec: number): Stint | null {
  for (const s of stints) {
    if (s.period === period && sec >= s.startSec && sec < s.endSec) return s;
  }
  return null;
}

/**
 * Every stint touching an instant. At a line change the instant is genuinely
 * ambiguous: the shift chart ends the outgoing shifts and starts the incoming
 * ones on the same second, while the play-by-play stamps the event that CAUSED
 * the stoppage (a goal, a whistle) at that same second — under the previous
 * lineup. Returning both lets the strength check distinguish "reconstruction is
 * wrong" from "the instant belongs to two lineups".
 */
export function stintsTouching(stints: Stint[], period: number, sec: number): Stint[] {
  return stints.filter(s =>
    s.period === period && sec >= s.startSec && sec <= s.endSec);
}

export const isStintBoundary = (stints: Stint[], period: number, sec: number): boolean =>
  stints.some(s => s.period === period && (s.startSec === sec || s.endSec === sec));

// ── Coverage report ──────────────────────────────────────────────

export interface CoverageReport {
  gameId: number;
  parse: ShiftParseReport;
  stintCount: number;
  totalStintSec: number;
  /** Sum over periods of (max shift end − min shift start); the span stints should tile. */
  periodSpanSec: number;
  tilingGapSec: number;
  even5v5Stints: number;
  even5v5Sec: number;
  /** Stints whose skater counts fall outside 3..6 a side — reconstruction smells. */
  invalidSkaterCountStints: number;
  strengthChecked: number;
  strengthAgreed: number;
  strengthAgreementPct: number | null;
  /** Agreement allowing a boundary instant to match either adjacent lineup. */
  strengthAgreedBoundaryTolerant: number;
  strengthAgreementBoundaryTolerantPct: number | null;
  /** Disagreement counts keyed by play-by-play event type. */
  disagreementsByEventType: Record<string, number>;
  /** How many disagreements sit exactly on a stint boundary. */
  disagreementsAtBoundary: number;
  /** A few worked examples for eyeballing. */
  disagreementSamples: {
    period: number; sec: number; typeDescKey?: string;
    derived: string; claimed: string; atBoundary: boolean;
  }[];
  rosterJoinPct: number | null;
}

export function buildCoverageReport(args: {
  gameId: number;
  parse: ShiftParseReport;
  shifts: Shift[];
  stints: Stint[];
  events?: { period: number; sec: number; situationCode?: string | null; typeDescKey?: string }[];
}): CoverageReport {
  const { gameId, parse, shifts, stints, events = [] } = args;

  // Stints should exactly tile each period's shift span; a gap means dropped time.
  const spanByPeriod = new Map<number, { min: number; max: number }>();
  for (const s of shifts) {
    const cur = spanByPeriod.get(s.period);
    if (!cur) spanByPeriod.set(s.period, { min: s.startSec, max: s.endSec });
    else { cur.min = Math.min(cur.min, s.startSec); cur.max = Math.max(cur.max, s.endSec); }
  }
  let periodSpanSec = 0;
  for (const { min, max } of spanByPeriod.values()) periodSpanSec += max - min;

  const totalStintSec = stints.reduce((sum, s) => sum + s.durationSec, 0);
  const even = stints.filter(s => s.isEven5v5);

  const invalidSkaterCountStints = stints.filter(s =>
    s.homeSkaters.length < 3 || s.homeSkaters.length > 6 ||
    s.awaySkaters.length < 3 || s.awaySkaters.length > 6).length;

  let strengthChecked = 0, strengthAgreed = 0, strengthAgreedBoundaryTolerant = 0;
  let disagreementsAtBoundary = 0;
  const disagreementsByEventType: Record<string, number> = {};
  const disagreementSamples: CoverageReport["disagreementSamples"] = [];

  for (const ev of events) {
    const parsed = parseSituationCode(ev.situationCode);
    if (!parsed) continue;
    const stint = findStintAt(stints, ev.period, ev.sec);
    if (!stint) continue;
    strengthChecked++;

    const matches = (s: Stint) =>
      s.homeSkaters.length === parsed.homeSkaters &&
      s.awaySkaters.length === parsed.awaySkaters;

    if (matches(stint)) { strengthAgreed++; strengthAgreedBoundaryTolerant++; continue; }

    // Strict check failed. Does ANY lineup touching this instant match?
    const touching = stintsTouching(stints, ev.period, ev.sec);
    if (touching.some(matches)) strengthAgreedBoundaryTolerant++;

    const atBoundary = isStintBoundary(stints, ev.period, ev.sec);
    if (atBoundary) disagreementsAtBoundary++;
    const key = ev.typeDescKey ?? "unknown";
    disagreementsByEventType[key] = (disagreementsByEventType[key] ?? 0) + 1;
    if (disagreementSamples.length < 8) {
      disagreementSamples.push({
        period: ev.period, sec: ev.sec, typeDescKey: ev.typeDescKey,
        derived: `${stint.awaySkaters.length}v${stint.homeSkaters.length}`,
        claimed: `${parsed.awaySkaters}v${parsed.homeSkaters}`,
        atBoundary,
      });
    }
  }

  return {
    gameId,
    parse,
    stintCount: stints.length,
    totalStintSec,
    periodSpanSec,
    tilingGapSec: periodSpanSec - totalStintSec,
    even5v5Stints: even.length,
    even5v5Sec: even.reduce((sum, s) => sum + s.durationSec, 0),
    invalidSkaterCountStints,
    strengthChecked,
    strengthAgreed,
    strengthAgreementPct: strengthChecked > 0 ? (100 * strengthAgreed) / strengthChecked : null,
    strengthAgreedBoundaryTolerant,
    strengthAgreementBoundaryTolerantPct: strengthChecked > 0
      ? (100 * strengthAgreedBoundaryTolerant) / strengthChecked : null,
    disagreementsByEventType,
    disagreementsAtBoundary,
    disagreementSamples,
    rosterJoinPct: parse.shiftRows > 0
      ? (100 * (parse.shiftRows - parse.unknownPlayerRows)) / parse.shiftRows
      : null,
  };
}

// ── Forward-combination TOI (validation against an external line file) ──

/**
 * Roll stints up to forward groups for one team, so derived ice time can be
 * checked against a published line-combination table. Uses NHL ids to build the
 * groups; names are attached only for reporting.
 */
export function forwardCombinationToi(
  stints: Stint[],
  roster: RosterSpot[],
  teamId: number,
  homeTeamId: number,
  opts: { even5v5Only?: boolean } = {},
): Map<string, { playerIds: number[]; names: string[]; seconds: number }> {
  const byId = new Map<number, RosterSpot>();
  for (const spot of roster) byId.set(spot.playerId, spot);
  const isHome = teamId === homeTeamId;
  const out = new Map<string, { playerIds: number[]; names: string[]; seconds: number }>();

  for (const stint of stints) {
    if (opts.even5v5Only && !stint.isEven5v5) continue;
    const side = isHome ? stint.homeSkaters : stint.awaySkaters;
    const forwards = side.filter(id => {
      const pos = byId.get(id)?.positionCode;
      return pos === "C" || pos === "L" || pos === "R";
    }).sort((a, b) => a - b);
    if (forwards.length === 0) continue;

    const key = forwards.join("-");
    const entry = out.get(key);
    if (entry) entry.seconds += stint.durationSec;
    else out.set(key, {
      playerIds: forwards,
      names: forwards.map(id => byId.get(id)?.fullName ?? String(id)),
      seconds: stint.durationSec,
    });
  }
  return out;
}

/** Normalise a name for the validation-only comparison against a line file. */
export const validationNameKey = (name: string): string =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, " ");

/** Parse a line-combination label like "CHRIS KREIDER - TROY TERRY" into keys. */
export const parseLineLabel = (label: string): string[] =>
  label.split(/\s+-\s+/).map(validationNameKey).filter(Boolean).sort();

export const formatSeconds = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
