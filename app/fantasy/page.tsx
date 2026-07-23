"use client";
// ── Fantasy Hockey Tools — /fantasy ──────────────────────────────
// F0 release priority: the fantasy research desk, workshopped into a
// draft-day tool. League-configurable scoring + roster build (drives FP
// and VBD replacement level), a sortable draft board with tier breaks,
// a live draft tracker (cross off taken players), regression radar,
// keeper corner ranked by the Ledger dynasty signal, and a goalie board.
// The math lives in app/lib/fantasy-board.ts (pure, tested).

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import {
  buildFantasyBoard,
  buildBreakoutWatch,
  buildGoalieBoard,
  keeperRank,
  sanitizeSettings,
  sortRows,
  BREAKOUT_BASE_RATE_PCT,
  DEFAULT_FANTASY_SETTINGS,
  FANTASY_SETTINGS_KEY,
  FANTASY_TAKEN_KEY,
  type BoardSortKey,
  type FantasyRow,
  type FantasySettings,
} from "@/app/lib/fantasy-board";
import { PlayerOutlook } from "@/app/components/PlayerOutlook";
import { derivePlayerRoles } from "@/app/lib/player-roles";

interface ApiPlayer {
  id: string; name: string; teamId: string; position: string;
  age: number; games?: number; headshot?: string | null;
  ptsPace?: number; goalsPace?: number | null; assistsPace?: number | null;
  xGPace?: number; ppPtsPace82?: number | null;
  baselineHits82?: number | null; baselineBlocks82?: number | null;
  avgTOI?: number;
  savePct?: number; gsax?: number; gamesStarted?: number;
  developmentProfile?: { dynastyScore?: number } | null;
}

type SortKey = BoardSortKey;

const ink = "var(--ledger-ink)";
const body = "var(--ledger-ink-body, var(--ledger-ink))";
const faint = "var(--ledger-ink-faint)";
const rule = "var(--ledger-rule)";
// Selected/active states use a distinct accent — a navy that reads as
// "selected" — rather than the near-black ink, which was too heavy.
const accent = "var(--ledger-navy, #1a2e5c)";
const accentInk = "#f2ecd7";
const PAGE_SIZE = 50;

const TIER_COLORS = [
  "var(--ledger-red)", "var(--ledger-navy, #1a2e5c)", "var(--ledger-green)",
  "var(--ledger-brown, #6e5a3d)", "var(--ledger-ink)",
];
const tierColor = (t: number) => TIER_COLORS[(t - 1) % TIER_COLORS.length];

// Windowed page list: first, last, and a run around the current page, with
// "…" gaps — so 15 pages don't print 15 buttons.
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  if (lo > 2) out.push("…");
  for (let n = lo; n <= hi; n++) out.push(n);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

function fmt(v: number | null | undefined, d = 0): string {
  return v == null ? "—" : v.toFixed(d);
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function writeStorage(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

// Compact numeric setting input
function Num({ label, value, onChange, step = 1, width = 52 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; width?: number;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-black font-mono uppercase tracking-[0.08em]" style={{ color: body }}>
      {label}
      <input
        type="number" value={value} step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="px-1.5 py-1 border text-[11px] font-mono"
        style={{ borderColor: rule, background: "var(--paper-bg)", color: ink, width }}
        aria-label={`${label} setting`}
      />
    </label>
  );
}

export default function FantasyPage() {
  const [players, setPlayers] = useState<ApiPlayer[]>([]);
  const [teamMap, setTeamMap] = useState<Map<string, string>>(new Map());
  const [standings, setStandings] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<"ALL" | "C" | "W" | "D">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("fp82");
  const [sortDesc, setSortDesc] = useState(true);
  const [settings, setSettings] = useState<FantasySettings>(DEFAULT_FANTASY_SETTINGS);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [hideTaken, setHideTaken] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Hydrate league settings + draft state once on the client.
  useEffect(() => {
    setSettings(sanitizeSettings(readStorage(FANTASY_SETTINGS_KEY, DEFAULT_FANTASY_SETTINGS)));
    setTaken(new Set(readStorage<string[]>(FANTASY_TAKEN_KEY, [])));
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) writeStorage(FANTASY_SETTINGS_KEY, settings); }, [settings, hydrated]);
  useEffect(() => { if (hydrated) writeStorage(FANTASY_TAKEN_KEY, [...taken]); }, [taken, hydrated]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pd, td] = await Promise.all([
          fetch("/api/league/players").then(r => r.json()),
          fetch("/api/league/teams").then(r => r.json()),
        ]);
        if (cancelled) return;
        setPlayers(pd.players ?? []);
        setTeamMap(new Map((td.teams ?? []).map((t: any) => [t.id, t.name])));
        setStandings(new Map((td.teams ?? []).map((t: any) => [t.id, t.standing])));
      } catch {
        if (!cancelled) setError("League data failed to load — refresh to retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const board: FantasyRow[] = useMemo(
    () => buildFantasyBoard(players, settings),
    [players, settings],
  );

  const teamName = useCallback(
    (id: string) => teamMap.get(id) ?? id,
    [teamMap],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = board.filter(r =>
      (posFilter === "ALL" || r.posGroup === posFilter) &&
      (!hideTaken || !taken.has(r.p.id)) &&
      (!q || r.p.name.toLowerCase().includes(q) || teamName(r.p.teamId).toLowerCase().includes(q)),
    );
    // sortRows lives in the tested engine — the page once shipped an
    // inverted comparator (least FP first on load); never again.
    return sortRows(rows, sortKey, sortDesc);
  }, [board, posFilter, search, sortKey, sortDesc, hideTaken, taken, teamName]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  // Any change to what's shown resets to the first page.
  useEffect(() => { setPage(1); }, [posFilter, search, sortKey, sortDesc, hideTaken]);

  const { buyLow, sellHigh } = useMemo(() => {
    const qualified = board.filter(r => (r.p.games ?? 0) >= 20 && (r.p.xGPace ?? 0) > 0);
    const withLuck = qualified.map(r => ({ r, luck: (r.g82 ?? 0) - (r.p.xGPace ?? 0) }));
    return {
      buyLow: withLuck.filter(x => x.luck <= -4).sort((a, b) => a.luck - b.luck).slice(0, 8),
      sellHigh: withLuck.filter(x => x.luck >= 5).sort((a, b) => b.luck - a.luck).slice(0, 8),
    };
  }, [board]);

  const keepers = useMemo(() => keeperRank(board), [board]);

  // EDGE Breakout Watch — same engine the season simulator trusts.
  const breakouts = useMemo(() => buildBreakoutWatch(players as any[]), [players]);

  // Modern role per board player (evidence-gated; null → no badge).
  const roleMap = useMemo(() => {
    const map = new Map<string, { label: string; icon: string; color: string }>();
    for (const r of board) {
      const roles = derivePlayerRoles(r.p as any);
      if (roles) map.set(r.p.id, roles.primary);
    }
    return map;
  }, [board]);

  const goalies = useMemo(
    () => buildGoalieBoard(players as any[], standings),
    [players, standings],
  );

  const toggleTaken = useCallback((id: string) => {
    setTaken(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const sortBy = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) { setSortDesc(d => !d); return prev; }
      setSortDesc(true);
      return key;
    });
  }, []);

  const Th = ({ k, label, title, align = "right" }: { k: SortKey; label: string; title?: string; align?: "right" | "center" }) => (
    <th scope="col" className={`text-${align} px-2 py-2`} aria-sort={sortKey === k ? (sortDesc ? "descending" : "ascending") : undefined}>
      <button
        type="button"
        onClick={() => sortBy(k)}
        title={title}
        className="font-black uppercase tracking-[0.12em] text-[9px] focus-visible:outline focus-visible:outline-2"
        style={{ color: sortKey === k ? accent : ink, background: "transparent", cursor: "pointer", outlineColor: accent }}
        aria-label={`Sort by ${label}`}
      >
        {label}{sortKey === k ? (sortDesc ? " ▾" : " ▴") : ""}
      </button>
    </th>
  );

  const set = (patch: Partial<FantasySettings>) =>
    setSettings(s => sanitizeSettings({ ...s, ...patch }));

  return (
    <main className="min-h-screen px-4 sm:px-6 py-4" style={{ background: "var(--paper-bg)", color: ink }}>
      <div className="mx-auto" style={{ maxWidth: 1100 }}>
        <Header activeTab="fantasy" />

        {/* Page lede */}
        <section className="pt-6 pb-4 border-b" style={{ borderColor: rule }}>
          <h2 className="text-[10px] font-black font-mono uppercase tracking-[0.3em]" style={{ color: "var(--ledger-red)" }}>
            The Fantasy Desk
          </h2>
          <p className="text-[20px] font-black font-serif mt-1" style={{ color: ink }}>
            Fantasy Hockey Tools
          </p>
          <p className="text-[12px] font-mono leading-relaxed mt-2 max-w-3xl" style={{ color: body }}>
            Fantasy research the box score can&apos;t give you: projections scored to <b>your league</b>,
            tier breaks where the talent actually drops, NHL EDGE breakout signals, and a full
            Ledger outlook — role, trajectory, and leading indicators — one tap deep on every player.
          </p>
        </section>

        {/* League settings */}
        <section className="pt-4" aria-label="League settings">
          <details className="border" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
            <summary className="px-3 py-2 text-[10px] font-black font-mono uppercase tracking-[0.2em]" style={{ color: ink, cursor: "pointer" }}>
              League Settings — {settings.teams} teams · {settings.starters.C}C/{settings.starters.W}W/{settings.starters.D}D ·
              G×{settings.scoring.G} A×{settings.scoring.A} PPP×{settings.scoring.PPP} HIT×{settings.scoring.HIT} BLK×{settings.scoring.BLK}
            </summary>
            <div className="px-3 pb-3 flex flex-wrap items-end gap-x-4 gap-y-2">
              <Num label="G" value={settings.scoring.G} onChange={v => set({ scoring: { ...settings.scoring, G: v } })} step={0.5} />
              <Num label="A" value={settings.scoring.A} onChange={v => set({ scoring: { ...settings.scoring, A: v } })} step={0.5} />
              <Num label="PPP" value={settings.scoring.PPP} onChange={v => set({ scoring: { ...settings.scoring, PPP: v } })} step={0.5} />
              <Num label="HIT" value={settings.scoring.HIT} onChange={v => set({ scoring: { ...settings.scoring, HIT: v } })} step={0.1} />
              <Num label="BLK" value={settings.scoring.BLK} onChange={v => set({ scoring: { ...settings.scoring, BLK: v } })} step={0.1} />
              <span className="mx-1 border-l self-stretch" style={{ borderColor: rule }} aria-hidden="true" />
              <Num label="Teams" value={settings.teams} onChange={v => set({ teams: v })} />
              <Num label="C slots" value={settings.starters.C} onChange={v => set({ starters: { ...settings.starters, C: v } })} />
              <Num label="W slots" value={settings.starters.W} onChange={v => set({ starters: { ...settings.starters, W: v } })} />
              <Num label="D slots" value={settings.starters.D} onChange={v => set({ starters: { ...settings.starters, D: v } })} />
              <button
                type="button"
                onClick={() => setSettings(DEFAULT_FANTASY_SETTINGS)}
                className="tap-target px-3 py-1.5 text-[10px] font-black font-mono uppercase tracking-[0.12em] border"
                style={{ borderColor: ink, background: "var(--paper-bg)", color: ink, cursor: "pointer" }}
              >
                Reset Defaults
              </button>
              <span className="text-[10px] font-mono w-full" style={{ color: faint }}>
                Settings persist on this device. VBD replacement = league size × starters at each slot.
              </span>
            </div>
          </details>
        </section>

        {loading && (
          <div className="py-16 text-center font-mono text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: body }} role="status">
            Setting the fantasy desk…
          </div>
        )}
        {error && (
          <div className="py-16 text-center font-mono text-[12px] font-black" style={{ color: "var(--ledger-red)" }} role="alert">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Regression radar */}
            <section className="pt-6" aria-label="Regression radar">
              <div className="text-[10px] font-black font-mono uppercase tracking-[0.25em] mb-3" style={{ color: faint }}>
                Regression Radar — Finishing vs Expected
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border p-3" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
                  <div className="text-[10px] font-black font-mono uppercase tracking-[0.15em] mb-2" style={{ color: "var(--ledger-green)" }}>
                    ▲ Buy Low — due for positive regression
                  </div>
                  {buyLow.length === 0 && <div className="text-[11px] font-mono" style={{ color: body }}>No qualified candidates.</div>}
                  {buyLow.map(({ r, luck }) => (
                    <div key={r.p.id} className="flex items-baseline justify-between py-1 border-b last:border-0" style={{ borderColor: "var(--ledger-rule-light, var(--ledger-rule))" }}>
                      <span className="text-[12px] font-black font-mono">{r.p.name}
                        <span className="text-[10px] font-bold ml-1.5" style={{ color: body }}>{teamName(r.p.teamId)} · {r.posGroup}</span>
                      </span>
                      <span className="text-[11px] font-black font-mono" style={{ color: "var(--ledger-green)" }}>
                        {fmt(luck, 1)} G vs xG
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border p-3" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
                  <div className="text-[10px] font-black font-mono uppercase tracking-[0.15em] mb-2" style={{ color: "var(--ledger-red)" }}>
                    ▼ Sell High — running hot on shooting luck
                  </div>
                  {sellHigh.length === 0 && <div className="text-[11px] font-mono" style={{ color: body }}>No qualified candidates.</div>}
                  {sellHigh.map(({ r, luck }) => (
                    <div key={r.p.id} className="flex items-baseline justify-between py-1 border-b last:border-0" style={{ borderColor: "var(--ledger-rule-light, var(--ledger-rule))" }}>
                      <span className="text-[12px] font-black font-mono">{r.p.name}
                        <span className="text-[10px] font-bold ml-1.5" style={{ color: body }}>{teamName(r.p.teamId)} · {r.posGroup}</span>
                      </span>
                      <span className="text-[11px] font-black font-mono" style={{ color: "var(--ledger-red)" }}>
                        +{fmt(luck, 1)} G vs xG
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* EDGE Breakout Watch */}
            {breakouts.length > 0 && (
              <section className="pt-6" aria-label="EDGE breakout watch">
                <div className="text-[10px] font-black font-mono uppercase tracking-[0.25em] mb-1" style={{ color: faint }}>
                  EDGE Breakout Watch — underlying signals ahead of the points
                </div>
                <div className="text-[10px] font-mono mb-3" style={{ color: body }}>
                  The number is <b>breakout odds</b>: the Ledger model&apos;s probability of a meaningful scoring
                  jump next season. League base rate is ~{BREAKOUT_BASE_RATE_PCT}%, so 30%+ is three times the field.
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {breakouts.map(e => (
                    <div key={e.p.id} className="border px-3 py-2 flex items-start justify-between gap-3"
                      style={{ borderColor: rule, background: "var(--paper-inset)" }}>
                      <span className="min-w-0">
                        <span className="text-[12px] font-black font-mono">
                          {/^\d+$/.test(String(e.p.id))
                            ? <a href={`/players/${e.p.id}`} className="no-underline hover:underline" style={{ color: ink }}>{e.p.name}</a>
                            : e.p.name}
                          <span className="text-[10px] font-bold ml-1.5" style={{ color: body }}>
                            {teamName(e.p.teamId)} · {e.posGroup} · {e.p.age}y
                          </span>
                        </span>
                        <span className="block text-[10px] font-mono mt-0.5" style={{ color: body }}>
                          {e.reason}
                        </span>
                        {e.evidence.length > 0 && (
                          <span className="flex flex-wrap gap-1 mt-1">
                            {e.evidence.map(ev => (
                              <span key={ev} className="text-[9px] font-black font-mono px-1 border"
                                style={{ color: faint, borderColor: rule, background: "var(--paper-bg)" }}>
                                {ev}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="text-right shrink-0"
                        title={`Modeled probability of a meaningful scoring jump next season. League base rate ≈ ${BREAKOUT_BASE_RATE_PCT}%.`}>
                        <span className="block text-[15px] font-black font-mono" style={{ color: "var(--ledger-green)" }}>
                          {e.breakoutPct}%
                        </span>
                        <span className="block text-[8px] font-black font-mono uppercase tracking-[0.1em]" style={{ color: faint }}>
                          breakout odds
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Keeper corner */}
            <section className="pt-6" aria-label="Keeper corner">
              <div className="text-[10px] font-black font-mono uppercase tracking-[0.25em] mb-3" style={{ color: faint }}>
                Keeper Corner — Age 23 &amp; under, ranked by Ledger dynasty signal
              </div>
              <div className="flex flex-wrap gap-2">
                {keepers.map((r, i) => (
                  <div key={r.p.id} className="border px-2.5 py-1.5" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
                    <span className="text-[10px] font-black font-mono mr-1.5" style={{ color: faint }}>{i + 1}</span>
                    <span className="text-[12px] font-black font-mono">{r.p.name}</span>
                    <span className="text-[10px] font-bold font-mono ml-1.5" style={{ color: body }}>
                      {r.posGroup} · {r.p.age}y · {r.fp82} FP
                      {r.p.developmentProfile?.dynastyScore != null && ` · DYN ${r.p.developmentProfile.dynastyScore}`}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Draft board */}
            <section className="pt-7" aria-label="Draft board">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="text-[10px] font-black font-mono uppercase tracking-[0.25em]" style={{ color: faint }}>
                  Draft Board — {filtered.length} skaters{taken.size > 0 && ` · ${taken.size} taken`}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(["ALL", "C", "W", "D"] as const).map(pos => (
                    <button
                      key={pos}
                      onClick={() => setPosFilter(pos)}
                      aria-pressed={posFilter === pos}
                      className="tap-target px-3 py-1 text-[10px] font-black font-mono uppercase tracking-[0.1em] border focus-visible:outline focus-visible:outline-2"
                      style={{
                        background: posFilter === pos ? accent : "var(--paper-inset)",
                        color: posFilter === pos ? accentInk : ink,
                        borderColor: posFilter === pos ? accent : rule,
                        cursor: "pointer",
                        outlineColor: accent,
                      }}
                    >
                      {pos}
                    </button>
                  ))}
                  <button
                    onClick={() => setHideTaken(h => !h)}
                    aria-pressed={hideTaken}
                    className="tap-target px-3 py-1 text-[10px] font-black font-mono uppercase tracking-[0.1em] border focus-visible:outline focus-visible:outline-2"
                    style={{
                      background: hideTaken ? "var(--ledger-red)" : "var(--paper-inset)",
                      color: hideTaken ? "var(--paper-bg)" : ink,
                      borderColor: hideTaken ? "var(--ledger-red)" : ink,
                      cursor: "pointer",
                      outlineColor: accent,
                    }}
                  >
                    Hide Taken
                  </button>
                  {taken.size > 0 && (
                    <button
                      onClick={() => setTaken(new Set())}
                      className="tap-target px-3 py-1 text-[10px] font-black font-mono uppercase tracking-[0.1em] border focus-visible:outline focus-visible:outline-2"
                      style={{ background: "var(--paper-inset)", color: "var(--ledger-red)", borderColor: rule, cursor: "pointer", outlineColor: accent }}
                    >
                      Reset Draft
                    </button>
                  )}
                  <input
                    type="search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search player or team…"
                    aria-label="Search draft board by player or team name"
                    className="px-2 py-1 text-[11px] font-mono border focus-visible:outline focus-visible:outline-2"
                    style={{ borderColor: rule, background: "var(--paper-bg)", color: ink, minWidth: 190, outlineColor: accent }}
                  />
                </div>
              </div>

              <div className="border overflow-x-auto" style={{ borderColor: rule }}>
                <table className="w-full font-mono" style={{ borderCollapse: "collapse", minWidth: 780 }}>
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ background: "var(--paper-inset)", color: ink }}>
                      <th scope="col" className="text-center px-2 py-2" title="Mark taken on draft night">✓</th>
                      <th scope="col" className="text-left px-2 py-2">Rk</th>
                      <th scope="col" className="text-center px-2 py-2" title="Tier — breaks placed at the largest projection drop-offs">Tier</th>
                      <th scope="col" className="text-left px-2 py-2">Player</th>
                      <th scope="col" className="text-left px-2 py-2" title="Ledger modern role — evidence-derived play style">Role</th>
                      <th scope="col" className="text-left px-2 py-2">Team</th>
                      <th scope="col" className="text-center px-2 py-2">Pos</th>
                      <Th k="age" label="Age" align="center" />
                      <Th k="fp82" label="FP/82" title="Fantasy points per 82 under your league scoring" />
                      <Th k="vbd" label="VBD" title="Value over the replacement player for your league size and build" />
                      <Th k="g82" label="G" />
                      <Th k="a82" label="A" />
                      <Th k="ppp82" label="PPP" />
                      <Th k="hit82" label="HIT" />
                      <Th k="blk82" label="BLK" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => {
                      const rank = pageStart + i + 1;
                      const isTaken = taken.has(r.p.id);
                      const isExpanded = expandedId === r.p.id;
                      const role = roleMap.get(r.p.id);
                      return (
                        <React.Fragment key={r.p.id}>
                        <tr className="text-[11px] border-t" style={{
                          borderColor: "var(--ledger-rule-light, var(--ledger-rule))",
                          color: ink,
                          opacity: isTaken ? 0.45 : 1,
                          cursor: "pointer",
                        }}
                          onClick={() => setExpandedId(prev => prev === r.p.id ? null : r.p.id)}
                          title={`${isExpanded ? "Hide" : "Show"} the Ledger outlook`}>
                          <td className="px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isTaken}
                              onChange={() => toggleTaken(r.p.id)}
                              aria-label={`Mark ${r.p.name} as ${isTaken ? "available" : "taken"}`}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td className="px-2 py-1.5 font-black" style={{ color: faint }}>{rank}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className="text-[9px] font-black px-1 border" style={{ color: tierColor(r.tier), borderColor: tierColor(r.tier) }}>
                              T{r.tier}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 font-black" style={{ textDecoration: isTaken ? "line-through" : "none" }}>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setExpandedId(prev => prev === r.p.id ? null : r.p.id); }}
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? "Hide" : "Show"} ${r.p.name}'s Ledger outlook`}
                              className="mr-1.5 inline-flex items-center justify-center align-middle border focus-visible:outline focus-visible:outline-2"
                              style={{
                                width: 26, height: 26, fontSize: 12,
                                color: isExpanded ? accentInk : ink,
                                background: isExpanded ? accent : "var(--paper-inset)",
                                borderColor: isExpanded ? accent : rule, cursor: "pointer",
                                outlineColor: accent,
                              }}
                            >
                              {isExpanded ? "▾" : "▸"}
                            </button>
                            {/^\d+$/.test(String(r.p.id))
                              ? <a href={`/players/${r.p.id}`} onClick={e => e.stopPropagation()} className="no-underline hover:underline" style={{ color: ink }}>{r.p.name}</a>
                              : r.p.name}
                          </td>
                          <td className="px-2 py-1.5" title={role ? `Ledger role: ${role.label}` : undefined}>
                            {role ? (
                              <span className="text-[9px] font-black uppercase tracking-[0.05em] whitespace-nowrap" style={{ color: role.color }}>
                                {role.icon} {role.label}
                              </span>
                            ) : (
                              <span style={{ color: faint }}>—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5" style={{ color: body }}>{teamName(r.p.teamId)}</td>
                          <td className="px-2 py-1.5 text-center font-black">{r.posGroup}</td>
                          <td className="px-2 py-1.5 text-center" style={{ color: body }}>{r.p.age}</td>
                          <td className="px-2 py-1.5 text-right font-black" style={{ fontVariantNumeric: "tabular-nums" }}>{r.fp82}</td>
                          <td className="px-2 py-1.5 text-right font-black" style={{
                            fontVariantNumeric: "tabular-nums",
                            color: r.vbd > 0 ? "var(--ledger-green)" : r.vbd < 0 ? "var(--ledger-red)" : body,
                          }}>
                            {r.vbd > 0 ? "+" : ""}{r.vbd}
                          </td>
                          <td className="px-2 py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums", color: body }}>{fmt(r.g82)}</td>
                          <td className="px-2 py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums", color: body }}>{fmt(r.a82)}</td>
                          <td className="px-2 py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums", color: body }}>{fmt(r.ppp82)}</td>
                          <td className="px-2 py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums", color: body }}>{fmt(r.hit82)}</td>
                          <td className="px-2 py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums", color: body }}>{fmt(r.blk82)}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-t" style={{ borderColor: "var(--ledger-rule-light, var(--ledger-rule))" }}>
                            <td colSpan={15} className="px-3 py-3" style={{ background: "var(--paper-inset)" }}>
                              {/* The full Ledger read — same component as the player dossier */}
                              <PlayerOutlook asset={r.p as any} />
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <nav className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-label="Draft board pagination">
                  <span className="text-[10px] font-mono" style={{ color: faint }}>
                    Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      aria-label="Previous page"
                      className="tap-target px-3 py-1.5 text-[10px] font-black font-mono uppercase tracking-[0.12em] border focus-visible:outline focus-visible:outline-2 disabled:opacity-40"
                      style={{ borderColor: rule, background: "var(--paper-inset)", color: ink, cursor: safePage <= 1 ? "default" : "pointer", outlineColor: accent }}
                    >
                      ‹ Prev
                    </button>
                    {pageNumbers(safePage, pageCount).map((n, idx) =>
                      n === "…" ? (
                        <span key={`gap-${idx}`} className="px-1.5 text-[10px] font-mono" style={{ color: faint }} aria-hidden="true">…</span>
                      ) : (
                        <button
                          key={n}
                          onClick={() => setPage(n as number)}
                          aria-label={`Page ${n}`}
                          aria-current={n === safePage ? "page" : undefined}
                          className="tap-target min-w-[30px] px-2 py-1.5 text-[10px] font-black font-mono border focus-visible:outline focus-visible:outline-2"
                          style={{
                            borderColor: n === safePage ? accent : rule,
                            background: n === safePage ? accent : "var(--paper-inset)",
                            color: n === safePage ? accentInk : ink,
                            cursor: "pointer", outlineColor: accent,
                          }}
                        >
                          {n}
                        </button>
                      ),
                    )}
                    <button
                      onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                      disabled={safePage >= pageCount}
                      aria-label="Next page"
                      className="tap-target px-3 py-1.5 text-[10px] font-black font-mono uppercase tracking-[0.12em] border focus-visible:outline focus-visible:outline-2 disabled:opacity-40"
                      style={{ borderColor: rule, background: "var(--paper-inset)", color: ink, cursor: safePage >= pageCount ? "default" : "pointer", outlineColor: accent }}
                    >
                      Next ›
                    </button>
                  </div>
                </nav>
              )}
            </section>

            {/* Goalie board */}
            <section className="pt-7 pb-8" aria-label="Goalie board">
              <div className="text-[10px] font-black font-mono uppercase tracking-[0.25em] mb-1" style={{ color: faint }}>
                Goalie Board — what wins goalie categories, in order
              </div>
              <div className="text-[10px] font-mono mb-3" style={{ color: body }}>
                Workload first (starts are the scarcest resource in fantasy), save quality second,
                and the team in front of him third — wins are a team stat.
              </div>
              <div className="border overflow-x-auto" style={{ borderColor: rule }}>
                <table className="w-full font-mono" style={{ borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ background: "var(--paper-inset)", color: ink }}>
                      <th scope="col" className="text-left px-2 py-2">Rk</th>
                      <th scope="col" className="text-left px-2 py-2">Goalie</th>
                      <th scope="col" className="text-left px-2 py-2">Team</th>
                      <th scope="col" className="text-right px-2 py-2" title="Games started">GS</th>
                      <th scope="col" className="text-right px-2 py-2" title="Share of his team's 82 games started — the workload signal">Start&nbsp;Share</th>
                      <th scope="col" className="text-right px-2 py-2">SV%</th>
                      <th scope="col" className="text-right px-2 py-2" title="Goals saved above expected — save quality independent of the defense in front">GSAx</th>
                      <th scope="col" className="text-center px-2 py-2" title="Win environment from team standing — wins are a team stat">Win&nbsp;Env</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goalies.map((entry, i) => {
                      const g = entry.p as any;
                      const envColor = entry.winEnv === "STRONG" ? "var(--ledger-green)" : entry.winEnv === "WEAK" ? "var(--ledger-red)" : body;
                      return (
                        <tr key={g.id} className="text-[11px] border-t" style={{ borderColor: "var(--ledger-rule-light, var(--ledger-rule))", color: ink }}>
                          <td className="px-2 py-1.5 font-black" style={{ color: faint }}>{i + 1}</td>
                          <td className="px-2 py-1.5 font-black">{g.name}</td>
                          <td className="px-2 py-1.5" style={{ color: body }}>{teamName(g.teamId)}</td>
                          <td className="px-2 py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums", color: body }}>{g.gamesStarted ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-black" style={{
                            fontVariantNumeric: "tabular-nums",
                            color: entry.startShare >= 60 ? "var(--ledger-green)" : entry.startShare >= 40 ? ink : body,
                          }}>
                            {entry.startShare}%
                          </td>
                          <td className="px-2 py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums", color: body }}>
                            {g.savePct != null ? (g.savePct > 1 ? g.savePct.toFixed(1) : (g.savePct * 100).toFixed(1)) : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right font-black" style={{
                            fontVariantNumeric: "tabular-nums",
                            color: (g.gsax ?? 0) > 0 ? "var(--ledger-green)" : "var(--ledger-red)",
                          }}>
                            {g.gsax != null ? `${g.gsax > 0 ? "+" : ""}${g.gsax.toFixed(1)}` : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <span className="text-[9px] font-black uppercase tracking-[0.08em]" style={{ color: envColor }}>
                              {entry.winEnv}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <Footer />
      </div>
    </main>
  );
}
