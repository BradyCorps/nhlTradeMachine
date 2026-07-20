"use client";
// ── Fantasy Hockey Tools — /fantasy ──────────────────────────────
// F0 release priority: the fantasy research desk. Draft board with
// points-league scoring computed from live per-82 data, value-based
// drafting (VBD) vs positional replacement, regression radar (finishing
// luck vs expected goals), keeper corner, and a goalie board.

import React, { useState, useEffect, useMemo } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";

// Standard points-league scoring (per-82 projection).
// SOG scoring lands when a skater shots-on-goal feed is added.
const SCORING = { G: 6, A: 4, PPP: 2, HIT: 0.6, BLK: 1 };

// Value-Based Drafting replacement ranks (12-team, 2C/4W/4D build)
const REPLACEMENT_RANK: Record<string, number> = { C: 24, W: 48, D: 48 };

interface ApiPlayer {
  id: string; name: string; teamId: string; position: string;
  age: number; games?: number; headshot?: string | null;
  ptsPace?: number; goalsPace?: number | null; assistsPace?: number | null;
  xGPace?: number; ppPtsPace82?: number | null;
  baselineHits82?: number | null; baselineBlocks82?: number | null;
  avgTOI?: number;
  savePct?: number; gsax?: number; gamesStarted?: number;
}

interface FantasySkater {
  p: ApiPlayer;
  teamName: string;
  posGroup: "C" | "W" | "D";
  g82: number; a82: number; ppp82: number; hit82: number | null; blk82: number | null;
  fp82: number;
  vbd: number;
}

const ink = "var(--ledger-ink)";
const body = "var(--ledger-ink-body, var(--ledger-ink))";
const faint = "var(--ledger-ink-faint)";
const rule = "var(--ledger-rule)";

function fmt(v: number | null | undefined, d = 0): string {
  return v == null ? "—" : v.toFixed(d);
}

export default function FantasyPage() {
  const [players, setPlayers] = useState<ApiPlayer[]>([]);
  const [teamMap, setTeamMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<"ALL" | "C" | "W" | "D">("ALL");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(50);

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
      } catch {
        if (!cancelled) setError("League data failed to load — refresh to retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const skaters: FantasySkater[] = useMemo(() => {
    const rows = players
      .filter(p => p.position !== "G" && p.position !== "Pick" && (p.games ?? 0) >= 10)
      .map(p => {
        const g82 = p.goalsPace ?? 0;
        const a82 = p.assistsPace ?? 0;
        const ppp82 = p.ppPtsPace82 ?? 0;
        const hit82 = p.baselineHits82 ?? null;
        const blk82 = p.baselineBlocks82 ?? null;
        const fp82 =
          g82 * SCORING.G + a82 * SCORING.A + ppp82 * SCORING.PPP +
          (hit82 ?? 0) * SCORING.HIT + (blk82 ?? 0) * SCORING.BLK;
        const posGroup: "C" | "W" | "D" =
          p.position === "C" ? "C" : p.position === "D" ? "D" : "W";
        return {
          p, posGroup,
          teamName: teamMap.get(p.teamId) ?? p.teamId,
          g82, a82, ppp82, hit82, blk82,
          fp82: Math.round(fp82),
          vbd: 0,
        };
      })
      .sort((a, b) => b.fp82 - a.fp82);

    // VBD: fantasy points above the positional replacement player
    const byPos: Record<string, number[]> = { C: [], W: [], D: [] };
    for (const r of rows) byPos[r.posGroup].push(r.fp82);
    const replacement: Record<string, number> = {};
    for (const pos of ["C", "W", "D"]) {
      const pool = byPos[pos];
      replacement[pos] = pool[Math.min(REPLACEMENT_RANK[pos] - 1, pool.length - 1)] ?? 0;
    }
    for (const r of rows) r.vbd = Math.round(r.fp82 - replacement[r.posGroup]);
    return rows;
  }, [players, teamMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skaters.filter(r =>
      (posFilter === "ALL" || r.posGroup === posFilter) &&
      (!q || r.p.name.toLowerCase().includes(q) || r.teamName.toLowerCase().includes(q)),
    );
  }, [skaters, posFilter, search]);

  // Regression radar — finishing luck vs expected goals
  const { buyLow, sellHigh } = useMemo(() => {
    const qualified = skaters.filter(r => (r.p.games ?? 0) >= 20 && (r.p.xGPace ?? 0) > 0);
    const withLuck = qualified.map(r => ({ r, luck: (r.g82 ?? 0) - (r.p.xGPace ?? 0) }));
    return {
      buyLow: withLuck.filter(x => x.luck <= -4).sort((a, b) => a.luck - b.luck).slice(0, 8),
      sellHigh: withLuck.filter(x => x.luck >= 5).sort((a, b) => b.luck - a.luck).slice(0, 8),
    };
  }, [skaters]);

  const keepers = useMemo(
    () => skaters.filter(r => r.p.age <= 23).slice(0, 10),
    [skaters],
  );

  const goalies = useMemo(() =>
    players
      .filter(p => p.position === "G" && (p.gamesStarted ?? 0) >= 10)
      .sort((a, b) => (b.gsax ?? -99) - (a.gsax ?? -99))
      .slice(0, 15),
    [players],
  );

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
            Draft research built on the Ledger&apos;s live data: points-league projections per 82 games,
            value over your league&apos;s replacement player, and a regression radar that separates
            real breakouts from shooting luck. Scoring: G ×{SCORING.G} · A ×{SCORING.A} · PPP ×{SCORING.PPP} · HIT ×{SCORING.HIT} · BLK ×{SCORING.BLK}.
          </p>
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
                        <span className="text-[10px] font-bold ml-1.5" style={{ color: body }}>{r.teamName} · {r.posGroup}</span>
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
                        <span className="text-[10px] font-bold ml-1.5" style={{ color: body }}>{r.teamName} · {r.posGroup}</span>
                      </span>
                      <span className="text-[11px] font-black font-mono" style={{ color: "var(--ledger-red)" }}>
                        +{fmt(luck, 1)} G vs xG
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Keeper corner */}
            <section className="pt-6" aria-label="Keeper corner">
              <div className="text-[10px] font-black font-mono uppercase tracking-[0.25em] mb-3" style={{ color: faint }}>
                Keeper Corner — Age 23 &amp; under, ranked by projection
              </div>
              <div className="flex flex-wrap gap-2">
                {keepers.map((r, i) => (
                  <div key={r.p.id} className="border px-2.5 py-1.5" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
                    <span className="text-[10px] font-black font-mono mr-1.5" style={{ color: faint }}>{i + 1}</span>
                    <span className="text-[12px] font-black font-mono">{r.p.name}</span>
                    <span className="text-[10px] font-bold font-mono ml-1.5" style={{ color: body }}>
                      {r.posGroup} · {r.p.age}y · {r.fp82} FP
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Draft board */}
            <section className="pt-7" aria-label="Draft board">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="text-[10px] font-black font-mono uppercase tracking-[0.25em]" style={{ color: faint }}>
                  Draft Board — {filtered.length} skaters
                </div>
                <div className="flex items-center gap-2">
                  {(["ALL", "C", "W", "D"] as const).map(pos => (
                    <button
                      key={pos}
                      onClick={() => setPosFilter(pos)}
                      aria-pressed={posFilter === pos}
                      className="tap-target px-3 py-1 text-[10px] font-black font-mono uppercase tracking-[0.1em] border"
                      style={{
                        background: posFilter === pos ? ink : "var(--paper-inset)",
                        color: posFilter === pos ? "var(--paper-bg)" : ink,
                        borderColor: ink,
                        cursor: "pointer",
                      }}
                    >
                      {pos}
                    </button>
                  ))}
                  <input
                    type="search"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search player or team…"
                    aria-label="Search draft board by player or team name"
                    className="px-2 py-1 text-[11px] font-mono border"
                    style={{ borderColor: rule, background: "var(--paper-bg)", color: ink, minWidth: 190 }}
                  />
                </div>
              </div>

              <div className="border overflow-x-auto" style={{ borderColor: rule }}>
                <table className="w-full font-mono" style={{ borderCollapse: "collapse", minWidth: 720 }}>
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ background: "var(--paper-inset)", color: ink }}>
                      <th scope="col" className="text-left px-2 py-2">Rk</th>
                      <th scope="col" className="text-left px-2 py-2">Player</th>
                      <th scope="col" className="text-left px-2 py-2">Team</th>
                      <th scope="col" className="text-center px-2 py-2">Pos</th>
                      <th scope="col" className="text-center px-2 py-2">Age</th>
                      <th scope="col" className="text-right px-2 py-2" title={`Fantasy points per 82 — G×${SCORING.G} A×${SCORING.A} PPP×${SCORING.PPP} HIT×${SCORING.HIT} BLK×${SCORING.BLK}`}>FP/82</th>
                      <th scope="col" className="text-right px-2 py-2" title="Value over the positional replacement player (12-team build)">VBD</th>
                      <th scope="col" className="text-right px-2 py-2">G</th>
                      <th scope="col" className="text-right px-2 py-2">A</th>
                      <th scope="col" className="text-right px-2 py-2">PPP</th>
                      <th scope="col" className="text-right px-2 py-2">HIT</th>
                      <th scope="col" className="text-right px-2 py-2">BLK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, shown).map((r, i) => (
                      <tr key={r.p.id} className="text-[11px] border-t" style={{ borderColor: "var(--ledger-rule-light, var(--ledger-rule))", color: ink }}>
                        <td className="px-2 py-1.5 font-black" style={{ color: faint }}>{i + 1}</td>
                        <td className="px-2 py-1.5 font-black">
                          {/^\d+$/.test(String(r.p.id))
                            ? <a href={`/players/${r.p.id}`} className="no-underline hover:underline" style={{ color: ink }}>{r.p.name}</a>
                            : r.p.name}
                        </td>
                        <td className="px-2 py-1.5" style={{ color: body }}>{r.teamName}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > shown && (
                <button
                  onClick={() => setShown(s => s + 50)}
                  className="tap-target mt-3 w-full py-2 text-[10px] font-black font-mono uppercase tracking-[0.2em] border"
                  style={{ borderColor: ink, background: "var(--paper-inset)", color: ink, cursor: "pointer" }}
                >
                  Show 50 More ({filtered.length - shown} remaining)
                </button>
              )}
            </section>

            {/* Goalie board */}
            <section className="pt-7 pb-8" aria-label="Goalie board">
              <div className="text-[10px] font-black font-mono uppercase tracking-[0.25em] mb-3" style={{ color: faint }}>
                Goalie Board — ranked by goals saved above expected
              </div>
              <div className="border overflow-x-auto" style={{ borderColor: rule }}>
                <table className="w-full font-mono" style={{ borderCollapse: "collapse", minWidth: 520 }}>
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-[0.12em]" style={{ background: "var(--paper-inset)", color: ink }}>
                      <th scope="col" className="text-left px-2 py-2">Rk</th>
                      <th scope="col" className="text-left px-2 py-2">Goalie</th>
                      <th scope="col" className="text-left px-2 py-2">Team</th>
                      <th scope="col" className="text-right px-2 py-2">GS</th>
                      <th scope="col" className="text-right px-2 py-2">SV%</th>
                      <th scope="col" className="text-right px-2 py-2" title="Goals saved above expected">GSAx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goalies.map((g, i) => (
                      <tr key={g.id} className="text-[11px] border-t" style={{ borderColor: "var(--ledger-rule-light, var(--ledger-rule))", color: ink }}>
                        <td className="px-2 py-1.5 font-black" style={{ color: faint }}>{i + 1}</td>
                        <td className="px-2 py-1.5 font-black">{g.name}</td>
                        <td className="px-2 py-1.5" style={{ color: body }}>{teamMap.get(g.teamId) ?? g.teamId}</td>
                        <td className="px-2 py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums", color: body }}>{g.gamesStarted ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums", color: body }}>
                          {g.savePct != null ? (g.savePct > 1 ? g.savePct.toFixed(1) : (g.savePct * 100).toFixed(1)) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right font-black" style={{
                          fontVariantNumeric: "tabular-nums",
                          color: (g.gsax ?? 0) > 0 ? "var(--ledger-green)" : "var(--ledger-red)",
                        }}>
                          {g.gsax != null ? `${g.gsax > 0 ? "+" : ""}${g.gsax.toFixed(1)}` : "—"}
                        </td>
                      </tr>
                    ))}
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
