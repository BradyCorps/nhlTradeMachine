// ── D1 — CSV trade ingestion ─────────────────────────────────────
// The trade-update backend was tedious: every completed real trade had to
// be hand-built asset-by-asset in the trades admin, then pick ownership
// updated separately in the draft-picks admin. This ingests a CSV export
// of completed trades in one pass: parse → group rows into trades →
// resolve every asset against the canonical roster (players) and the pick
// inventory grammar (picks). Pure and fully testable; the admin route
// applies the result (frozen trade records + draft-pick overrides).
//
// CSV format — one row per asset movement, header required:
//
//   date,from,to,asset,retained,conditions
//   2026-06-28,WPG,CGY,Nikolaj Ehlers,25%,
//   2026-06-28,CGY,WPG,2027 1st,,
//   2026-06-28,CGY,WPG,2028 3rd (via SJS),,top-10 protected
//
// Rows sharing a date and the same (unordered) team pair merge into one
// trade. "via XXX" marks a pick whose original owner is another club;
// without it the sending team is the original owner.

import { canonicalNameSlug } from "./player-identity";

export interface TradeCsvRow {
  line: number;
  date: string;
  from: string;
  to: string;
  asset: string;
  retainedPct: number;
  conditions: string | null;
}

export interface ParsedPick {
  year: number;
  round: number;
  /** Original owner if "via XXX" was given; null = the sending team. */
  viaTeamId: string | null;
}

export interface CsvIssue {
  line: number | null;
  message: string;
}

export interface GroupedTrade {
  key: string;
  date: string;
  teamA: string;
  teamB: string;
  rows: TradeCsvRow[];
  conditions: string | null;
}

export interface ResolvedPickTransfer {
  pickId: string; // pick-{ORIG}-{year}-{round}
  originalOwnerId: string;
  currentOwnerId: string; // receiving team
  round: number;
  year: number;
  conditions: string | null;
}

export interface ResolvedTradeSideAsset {
  kind: "player" | "pick";
  asset: Record<string, unknown>; // full Asset snapshot for the evaluator
}

export interface ResolvedTrade {
  key: string;
  date: string;
  teamA: string;
  teamB: string;
  sideA: ResolvedTradeSideAsset[];
  sideB: ResolvedTradeSideAsset[];
  pickTransfers: ResolvedPickTransfer[];
  conditions: string | null;
  warnings: string[];
  errors: string[];
}

// ── CSV parsing (quote-aware, minimal) ───────────────────────────
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRetained(raw: string): number | null {
  if (!raw) return 0;
  const pct = raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  if (!Number.isFinite(pct) || pct < 0 || pct > 0.5) return null;
  return pct;
}

export function parseTradeCsv(csv: string): { rows: TradeCsvRow[]; issues: CsvIssue[] } {
  const rows: TradeCsvRow[] = [];
  const issues: CsvIssue[] = [];
  const lines = csv.split(/\r?\n/);

  let start = 0;
  // Header row is required (and skipped); tolerate leading blank lines.
  while (start < lines.length && !lines[start].trim()) start++;
  const header = lines[start] ? splitCsvLine(lines[start]).map(c => c.toLowerCase()) : [];
  if (header[0] !== "date" || header[1] !== "from" || header[2] !== "to" || header[3] !== "asset") {
    issues.push({ line: start + 1, message: "Header must be: date,from,to,asset,retained,conditions" });
    return { rows, issues };
  }

  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = splitCsvLine(raw);
    const [date, from, to, asset, retained = "", conditions = ""] = cells;
    const line = i + 1;

    if (!DATE_RE.test(date)) { issues.push({ line, message: `Bad date "${date}" — use YYYY-MM-DD` }); continue; }
    const fromId = from.toUpperCase();
    const toId = to.toUpperCase();
    if (!fromId || !toId) { issues.push({ line, message: "Both from and to teams are required" }); continue; }
    if (fromId === toId) { issues.push({ line, message: `From and to are both ${fromId}` }); continue; }
    if (!asset) { issues.push({ line, message: "Asset is required" }); continue; }
    const retainedPct = parseRetained(retained);
    if (retainedPct === null) { issues.push({ line, message: `Bad retained "${retained}" — use 0-50% (e.g. 25%)` }); continue; }

    rows.push({
      line, date, from: fromId, to: toId, asset,
      retainedPct, conditions: conditions || null,
    });
  }

  return { rows, issues };
}

// ── Pick grammar ─────────────────────────────────────────────────
// "2027 1st", "2027 1st round", "2027 1st round pick", "2028 R3",
// "2027 round 1", each optionally "(via SJS)" / "via SJS".
const ORDINALS: Record<string, number> = {
  "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7,
};

export function parsePickToken(token: string): ParsedPick | null {
  const viaMatch = /\(?\s*via\s+([A-Za-z]{2,3})\s*\)?/i.exec(token);
  const viaTeamId = viaMatch ? viaMatch[1].toUpperCase() : null;
  const rest = token.replace(/\(?\s*via\s+[A-Za-z]{2,3}\s*\)?/i, "").trim();

  const m = /^(\d{4})\s+(?:(1st|2nd|3rd|[4-7]th)|r([1-7])|round\s+([1-7]))(?:\s+round)?(?:\s+pick)?$/i.exec(rest);
  if (!m) return null;
  const year = Number(m[1]);
  const round = m[2] ? ORDINALS[m[2].toLowerCase()] : Number(m[3] ?? m[4]);
  if (!round || year < 2000 || year > 2100) return null;
  return { year, round, viaTeamId };
}

// ── Grouping — same date + same unordered team pair = one trade ──
export function groupTradeRows(rows: TradeCsvRow[]): { trades: GroupedTrade[]; issues: CsvIssue[] } {
  const map = new Map<string, GroupedTrade>();
  const issues: CsvIssue[] = [];

  for (const row of rows) {
    const pair = [row.from, row.to].sort();
    const key = `${row.date}:${pair[0]}:${pair[1]}`;
    let group = map.get(key);
    if (!group) {
      group = { key, date: row.date, teamA: pair[0], teamB: pair[1], rows: [], conditions: null };
      map.set(key, group);
    }
    group.rows.push(row);
    if (row.conditions && !group.conditions?.includes(row.conditions)) {
      group.conditions = group.conditions ? `${group.conditions}; ${row.conditions}` : row.conditions;
    }
  }

  const trades = [...map.values()];
  for (const t of trades) {
    const aGives = t.rows.some(r => r.from === t.teamA);
    const bGives = t.rows.some(r => r.from === t.teamB);
    if (!aGives || !bGives) {
      issues.push({
        line: t.rows[0]?.line ?? null,
        message: `${t.date} ${t.teamA}↔${t.teamB}: one-way trade — both teams must send at least one asset`,
      });
    }
  }

  return { trades, issues };
}

// ── Resolution against the canonical roster ──────────────────────
export interface ResolveContext {
  /** Full league players (from assembleCanonicalRoster). */
  players: Array<Record<string, any>>;
  /** Valid team ids. */
  teamIds: Set<string>;
  /** First tradable draft year — earlier pick years are rejected. */
  firstTradablePickYear: number;
}

function pickAssetSnapshot(pick: ResolvedPickTransfer, fromTeamId: string): Record<string, unknown> {
  const roundLabel = pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`;
  const ownerSuffix = pick.originalOwnerId !== fromTeamId ? ` via ${pick.originalOwnerId}` : ` (${pick.originalOwnerId})`;
  return {
    id: pick.pickId,
    teamId: fromTeamId,
    name: `${pick.year} ${roundLabel} Round Pick${ownerSuffix}`,
    position: "Pick",
    age: 19,
    round: pick.round,
    year: pick.year,
    isProtected: false,
    conditions: pick.conditions,
    games: 0, ptsPace: 0, xGPace: 0, defRate: 0,
    avgTOI: 0, qocIndex: null,
    capHit: 0, yearsRemaining: 0,
    hasNMC: false, hasNTC: false,
    canRetain: false, retainedPct: 0,
    multiplier: 1.0, hasLiveStats: false,
  };
}

export function resolveTrades(groups: GroupedTrade[], ctx: ResolveContext): ResolvedTrade[] {
  const bySlug = new Map<string, Record<string, any>>();
  for (const p of ctx.players) {
    if (p.position === "Pick") continue;
    const slug = canonicalNameSlug(String(p.name ?? ""));
    if (slug && !bySlug.has(slug)) bySlug.set(slug, p);
  }

  return groups.map((g) => {
    const out: ResolvedTrade = {
      key: g.key, date: g.date, teamA: g.teamA, teamB: g.teamB,
      sideA: [], sideB: [], pickTransfers: [],
      conditions: g.conditions, warnings: [], errors: [],
    };

    for (const teamId of [g.teamA, g.teamB]) {
      if (!ctx.teamIds.has(teamId)) out.errors.push(`Unknown team "${teamId}"`);
    }

    for (const row of g.rows) {
      const side = row.from === g.teamA ? out.sideA : out.sideB;
      const pick = parsePickToken(row.asset);

      if (pick) {
        if (pick.year < ctx.firstTradablePickYear) {
          out.errors.push(`Line ${row.line}: ${row.asset} — ${pick.year} draft has already happened (first tradable year is ${ctx.firstTradablePickYear})`);
          continue;
        }
        const originalOwnerId = pick.viaTeamId ?? row.from;
        if (pick.viaTeamId && !ctx.teamIds.has(pick.viaTeamId)) {
          out.errors.push(`Line ${row.line}: unknown "via" team ${pick.viaTeamId}`);
          continue;
        }
        const transfer: ResolvedPickTransfer = {
          pickId: `pick-${originalOwnerId}-${pick.year}-${pick.round}`,
          originalOwnerId,
          currentOwnerId: row.to,
          round: pick.round,
          year: pick.year,
          conditions: row.conditions,
        };
        out.pickTransfers.push(transfer);
        side.push({ kind: "pick", asset: pickAssetSnapshot(transfer, row.from) });
        continue;
      }

      // Player — resolve by canonical name slug against the live roster.
      const slug = canonicalNameSlug(row.asset);
      const player = bySlug.get(slug);
      if (!player) {
        out.errors.push(`Line ${row.line}: player "${row.asset}" not found in the canonical roster`);
        continue;
      }
      if (player.teamId !== row.from) {
        out.warnings.push(
          `Line ${row.line}: ${player.name} is listed on ${player.teamId}, not ${row.from} — ingesting anyway (roster may lag the trade)`,
        );
      }
      side.push({
        kind: "player",
        asset: { ...player, retainedPct: row.retainedPct },
      });
    }

    if (out.sideA.length === 0 || out.sideB.length === 0) {
      out.errors.push("Both teams must send at least one resolvable asset");
    }

    return out;
  });
}
