"use client";
// Season Results pager: Team Numbers (Ledger Line), League Numbers, Bracket.
import React, { useState } from "react";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import PlayoffBracket from "@/app/components/PlayoffBracket";
import { SEASON } from "@/app/lib/season-config";

export function SeasonResultsPager({ simData, simResult, players = [], navMap = {} }: {
  simData: any | null;
  simResult: string | null;
  players?: Asset[];
  navMap?: Record<string, XNAVResult>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"next" | "prev">("next");
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);

  const renderRecapLine = (line: string, i: number) => {
    if (line.startsWith('## ') || line.startsWith('**THE ') || line.startsWith('**EDMONTON') || line.startsWith('**AROUND') || line.startsWith('**THE YEAR') || line.startsWith('**DRAFT') || line.startsWith('**VERDICT')) {
      const text = line.replace(/^\#{1,3}\s+/, '').replace(/\*\*/g, '');
      return <div key={i} className="font-black text-[11px] uppercase tracking-widest mt-4 mb-1" style={{ color: 'var(--ledger-ink)', borderBottom: '1px solid #c8b890', paddingBottom: '4px' }}>{text}</div>;
    }
    if (line.startsWith('- **') || line.startsWith('- ')) {
      const text = line.replace(/^-\s+/, '').replace(/\*\*(.*?)\*\*/g, '$1');
      return <div key={i} className="text-[11px] leading-relaxed pl-3" style={{ color: 'var(--ledger-ink-mid)', borderLeft: '2px solid #b8a070' }}>{text}</div>;
    }
    if (line.trim() === '' || line.startsWith('#')) return null;
    const boldParts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <p key={i} className="text-[11px] leading-[1.8]" style={{ color: 'var(--ledger-ink-mid)' }}>
        {boldParts.map((part, j) => j % 2 === 0 ? part : <strong key={j}>{part}</strong>)}
      </p>
    );
  };

  const shortName = (name?: string) => name?.split(' ').pop() ?? '—';
  const playerLine = (p: any, suffix = "pts") => p ? `${shortName(p.name)} ${p.projectedPts ?? p.pts}${suffix}` : '—';
  const StatCell = ({ label, val }: { label: string; val: any }) => (
    <div style={{ background: 'var(--ledger-cream)', border: '1px solid #c8b890', padding: '5px 6px', textAlign: 'center' }}>
      <div style={{ fontSize: '10px', color: 'var(--ledger-ink-body, var(--ledger-ink))', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: '11px', fontWeight: 900, color: 'var(--ledger-ink)', marginTop: '2px' }}>{val ?? '—'}</div>
    </div>
  );
  const TeamNumbers = ({ t }: { t: any }) => {
    const skaters = t.projectedSkaters ?? [];
    const goalsLeader = [...skaters].sort((a, b) => (b.projectedGoals ?? 0) - (a.projectedGoals ?? 0))[0];
    const assistsLeader = [...skaters].sort((a, b) => (b.projectedAssists ?? 0) - (a.projectedAssists ?? 0))[0];
    const breakout = skaters.find((p: any) => p.breakoutTag === "BREAKOUT" || p.breakoutTag === "VETERAN_HOLD");
    const regression = skaters.find((p: any) => p.breakoutTag === "REGRESSION");
    const topSixPts = skaters.slice(0, 6).reduce((s: number, p: any) => s + (p.projectedPts ?? 0), 0);
    const topNinePts = skaters.slice(0, 9).reduce((s: number, p: any) => s + (p.projectedPts ?? 0), 0);
    const dPts = skaters.filter((p: any) => p.position === "D").reduce((s: number, p: any) => s + (p.projectedPts ?? 0), 0);
    const avgAge = skaters.length
      ? (skaters.reduce((s: number, p: any) => s + (p.age ?? 0), 0) / skaters.length).toFixed(1)
      : '—';

    return (
      <div style={{ background: 'var(--ledger-card)', border: '1px solid #b8a070', padding: '10px 12px' }}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <div>
            <div className="font-black text-[12px] text-ledger-ink font-serif">{t.teamName}</div>
            <div className="text-[9px] uppercase tracking-widest text-ledger-ink-faint font-mono mt-0.5">
              {t.phase ?? 'Unknown'} · #{t.leagueRank} league · #{t.divisionRank} {t.division}
            </div>
          </div>
          <span className="text-2xs font-black px-1.5 py-0.5 shrink-0" style={{
            color: t.madePlayoffs ? 'var(--ledger-green)' : 'var(--ledger-red)',
            border: `1px solid ${t.madePlayoffs ? 'rgba(26,92,46,0.4)' : 'rgba(184,48,32,0.4)'}`,
          }}>
            {t.madePlayoffs ? 'PLAYOFFS' : 'MISSED'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          <StatCell label="Points" val={t.projectedPoints} />
          <StatCell label="Top Scorer" val={playerLine(t.topScorer)} />
          <StatCell label="Goals" val={goalsLeader ? `${shortName(goalsLeader.name)} ${goalsLeader.projectedGoals}G` : '—'} />
          <StatCell label="Assists" val={assistsLeader ? `${shortName(assistsLeader.name)} ${assistsLeader.projectedAssists}A` : '—'} />
          <StatCell label="Top 6 Pts" val={topSixPts} />
          <StatCell label="Top 9 Pts" val={topNinePts} />
          <StatCell label="D Pts" val={dPts} />
          <StatCell label="Avg Age" val={avgAge} />
          <StatCell label="Top D" val={playerLine(t.topDefenseman)} />
          <StatCell label="Goalie" val={t.goalie?.name ? shortName(t.goalie.name) : '—'} />
          <StatCell label="GAA" val={t.goalie?.projectedGAA ?? '—'} />
          <StatCell label="SV%" val={t.goalie?.projectedSVP?.toFixed(3) ?? '—'} />
          <StatCell label="Breakout" val={breakout ? `${shortName(breakout.name)} ${breakout.projectedPts}pts` : '—'} />
          <StatCell label="Risk" val={regression ? `${shortName(regression.name)} ${regression.projectedPts}pts` : '—'} />
          <StatCell label="Skater Pool" val={`${skaters.length} tracked`} />
          <StatCell label="Seed" val={simData?.seed ?? '—'} />
        </div>

        {/* The Ledger Line — season box score joined against the valuation engine */}
        <details className="mt-2.5" open>
          <summary
            className="cursor-pointer select-none text-[10px] font-black font-mono uppercase tracking-[0.2em] pb-1"
            style={{ color: 'var(--ledger-ink-faint)' }}
          >
            Season Stats — The Ledger Line
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full font-mono" style={{ borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #b8a070' }}>
                  {["#", "Player", "GP", "G", "A", "PTS", "ΔXP", "X-NAV", "NOIV", "CAP±"].map((h, i) => (
                    <th key={i} className="text-[9px] uppercase tracking-wider py-1 px-1.5"
                      style={{ color: 'var(--ledger-ink-faint)', textAlign: i < 2 ? 'left' : 'right', fontWeight: 900 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skaters.map((p: any, i: number) => {
                  const roster = players.find(a => a.id === p.playerId);
                  const nav = p.playerId ? navMap[p.playerId] : undefined;
                  // Performance vs preseason expectation, scaled to games actually played
                  const expected = roster && roster.ptsPace > 0
                    ? Math.round(roster.ptsPace * (p.gamesPlayed / 82))
                    : null;
                  const dxp = expected !== null ? p.projectedPts - expected : null;
                  const capSurplus = nav?.fmvAav != null && roster
                    ? nav.fmvAav - roster.capHit * (1 - (roster.retainedPct ?? 0))
                    : null;
                  const archetype = nav?.fArchetype
                    ? nav.fArchetype.replace(/_/g, " ")
                    : nav?.rosterTier?.replace(/_/g, " ") ?? "";
                  const posNeg = (v: number) => v > 0 ? 'var(--ledger-green)' : v < 0 ? 'var(--ledger-red)' : 'var(--ledger-ink-faint)';
                  const rowKey = p.playerId ?? `${p.name}-${i}`;
                  const isOpen = openPlayer === rowKey;
                  return (
                    <React.Fragment key={rowKey}>
                    <tr
                      style={{ borderBottom: '1px solid rgba(200,184,144,0.45)', cursor: nav ? 'pointer' : 'default', background: isOpen ? 'var(--ledger-cream)' : 'transparent' }}
                      onClick={() => nav && setOpenPlayer(isOpen ? null : rowKey)}
                      title={nav ? 'Tap for the valuation breakdown' : undefined}
                    >
                      <td className="text-[10px] py-1.5 px-1.5 text-left align-top" style={{ color: 'var(--ledger-ink-faint)' }}>{isOpen ? '▾' : i + 1}</td>
                      <td className="text-[11px] py-1.5 px-1.5 text-left">
                        <span className="font-black" style={{ color: 'var(--ledger-ink)' }}>{p.name}</span>
                        {p.calderEligible && (
                          <span className="ml-1 px-1 text-[10px] font-black" style={{ color: '#fff', background: 'var(--ledger-navy, #2c3e6b)', borderRadius: 1 }}>R</span>
                        )}
                        <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--ledger-ink-faint)' }}>
                          {p.position} · {p.age ?? '—'}{archetype ? ` · ${archetype}` : ''}
                        </div>
                      </td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums align-top" style={{ color: 'var(--ledger-ink-faint)' }}>{p.gamesPlayed}</td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums align-top" style={{ color: 'var(--ledger-ink)' }}>{p.projectedGoals}</td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums align-top" style={{ color: 'var(--ledger-ink)' }}>{p.projectedAssists}</td>
                      <td className="text-[11px] py-1.5 px-1.5 text-right tabular-nums font-black align-top" style={{ color: 'var(--ledger-ink)' }}>{p.projectedPts}</td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums font-black align-top" style={{ color: dxp === null ? 'var(--ledger-ink-faint)' : posNeg(dxp) }}>
                        {dxp === null ? '—' : dxp > 0 ? `+${dxp}` : dxp}
                        {p.breakoutTag === 'BREAKOUT' && <span title="Breakout season"> ▲</span>}
                        {p.breakoutTag === 'VETERAN_HOLD' && <span title="Held off decline"> ▲</span>}
                        {p.breakoutTag === 'REGRESSION' && <span title="Down year"> ▼</span>}
                      </td>
                      <td className="text-[11px] py-1.5 px-1.5 text-right tabular-nums font-black align-top" style={{ color: 'var(--ledger-ink)' }}>
                        {nav ? nav.total : '—'}
                      </td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums align-top" style={{ color: nav?.noivImpact != null ? posNeg(nav.noivImpact) : 'var(--ledger-ink-faint)' }}>
                        {nav?.noivImpact != null ? (nav.noivImpact > 0 ? `+${nav.noivImpact}` : nav.noivImpact) : '—'}
                      </td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums align-top" style={{ color: capSurplus === null ? 'var(--ledger-ink-faint)' : posNeg(capSurplus) }}>
                        {capSurplus === null ? '—' : `${capSurplus > 0 ? '+' : ''}${capSurplus.toFixed(1)}M`}
                      </td>
                    </tr>
                    {isOpen && nav && (
                      <tr style={{ borderBottom: '1px solid #b8a070', background: 'var(--ledger-cream)' }}>
                        <td colSpan={10} className="py-2 px-3">
                          {/* Valuation breakdown — the components behind the X-NAV number */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2">
                            {([
                              ['Offense', nav.off, 250],
                              ['Defense', nav.def, 80],
                              ['Age Curve', nav.age, 40],
                              ['Contract', nav.cap, 80],
                              ['Upside', nav.upside, 40],
                            ] as [string, number, number][]).map(([label, val, scale]) => (
                              <div key={label}>
                                <div className="flex items-baseline justify-between">
                                  <span className="text-[9px] font-black font-mono uppercase tracking-wider" style={{ color: 'var(--ledger-ink)' }}>{label}</span>
                                  <span className="text-[10px] font-black font-mono tabular-nums" style={{ color: posNeg(val) }}>
                                    {val > 0 ? `+${val}` : val}
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 w-full" style={{ background: 'rgba(200,184,144,0.5)', borderRadius: 1 }}>
                                  <div
                                    className="h-1.5"
                                    style={{
                                      width: `${Math.min(100, Math.abs(val) / scale * 100)}%`,
                                      background: val >= 0 ? 'var(--ledger-green)' : 'var(--ledger-red)',
                                      borderRadius: 1,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-mono" style={{ color: 'var(--ledger-ink-body, var(--ledger-ink))' }}>
                            <span>FMV <strong>${nav.fmvAav?.toFixed(1) ?? '—'}M</strong></span>
                            {roster && <span>Cap Hit <strong>${roster.capHit.toFixed(1)}M × {roster.yearsRemaining}yr</strong></span>}
                            {nav.rosterTier && <span>Tier <strong>{nav.rosterTier.replace(/_/g, ' ')}</strong></span>}
                            {expected !== null && <span>Expected <strong>{expected} pts</strong> → Actual <strong>{p.projectedPts}</strong></span>}
                            {roster?.hdFinishingDelta != null && (
                              <span title="NHL EDGE: high-danger finishing vs league average — negative means unlucky on quality chances (breakout fuel)">
                                NHL EDGE HD{' '}
                                <strong style={{ color: roster.hdFinishingDelta <= -0.02 ? 'var(--ledger-green)' : roster.hdFinishingDelta >= 0.03 ? 'var(--ledger-red)' : 'inherit' }}>
                                  {roster.hdFinishingDelta > 0 ? '+' : ''}{(roster.hdFinishingDelta * 100).toFixed(1)}%
                                </strong>{' '}vs league
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Crease */}
          {t.goalie && (() => {
            const gRoster = players.find(a => a.name === t.goalie.name && a.position === 'G');
            const gNav = gRoster ? navMap[gRoster.id] : undefined;
            const gCapSurplus = gNav?.fmvAav != null && gRoster
              ? gNav.fmvAav - gRoster.capHit * (1 - (gRoster.retainedPct ?? 0))
              : null;
            return (
              <div className="overflow-x-auto mt-1.5">
                <table className="w-full font-mono" style={{ borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #b8a070' }}>
                      {["Goaltender", "GS", "GAA", "SV%", "GSAX", "X-NAV", "CAP±"].map((h, i) => (
                        <th key={i} className="text-[9px] uppercase tracking-wider py-1 px-1.5"
                          style={{ color: 'var(--ledger-ink-faint)', textAlign: i === 0 ? 'left' : 'right', fontWeight: 900 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-[11px] py-1.5 px-1.5 text-left font-black" style={{ color: 'var(--ledger-ink)' }}>{t.goalie.name}</td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums" style={{ color: 'var(--ledger-ink)' }}>{t.goalie.gamesStarted ?? '—'}</td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums" style={{ color: 'var(--ledger-ink)' }}>{t.goalie.projectedGAA ?? '—'}</td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums" style={{ color: 'var(--ledger-ink)' }}>{t.goalie.projectedSVP?.toFixed(3) ?? '—'}</td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums font-black" style={{ color: (t.goalie.gsax ?? 0) >= 0 ? 'var(--ledger-green)' : 'var(--ledger-red)' }}>
                        {t.goalie.gsax != null ? `${t.goalie.gsax > 0 ? '+' : ''}${t.goalie.gsax.toFixed(2)}` : '—'}
                      </td>
                      <td className="text-[11px] py-1.5 px-1.5 text-right tabular-nums font-black" style={{ color: 'var(--ledger-ink)' }}>{gNav ? gNav.total : '—'}</td>
                      <td className="text-[10px] py-1.5 px-1.5 text-right tabular-nums" style={{ color: gCapSurplus === null ? 'var(--ledger-ink-faint)' : gCapSurplus > 0 ? 'var(--ledger-green)' : 'var(--ledger-red)' }}>
                        {gCapSurplus === null ? '—' : `${gCapSurplus > 0 ? '+' : ''}${gCapSurplus.toFixed(1)}M`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          <div className="mt-2 text-[10px] font-mono uppercase tracking-wider leading-relaxed" style={{ color: 'var(--ledger-ink-faint)' }}>
            ΔXP — points vs preseason pace over games played · X-NAV — net asset value · NOIV — net on-ice value impact · CAP± — fair market AAV minus cap hit
          </div>
        </details>
      </div>
    );
  };

  const teamPage = simData ? {
    label: "Team Numbers",
    node: (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[simData.homeTeam, simData.partnerTeam].filter(Boolean).map((t: any) => <TeamNumbers key={t.teamId} t={t} />)}
      </div>
    ),
  } : null;

  const leaguePage = simData ? {
    label: "League Numbers",
    node: (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {[
          { label: "Presidents' Trophy", val: `${simData.leaders?.presidentsTrophy?.teamName} (${simData.leaders?.presidentsTrophy?.projectedPoints}pts)` },
          { label: "Reigning Cup", val: simData.latestCompleted?.stanleyCupChampion?.teamName ?? SEASON.latestCompleted.stanleyCupChampion.teamName },
          { label: "Stanley Cup", val: simData.playoffBracket?.champion?.teamName ?? simData.leaders?.cupWinner?.teamName },
          { label: "Points Leader", val: `${simData.leaders?.topScorer?.name?.split(' ').pop()} ${simData.leaders?.topScorer?.pts}pts` },
          { label: "Goals Leader", val: `${simData.leaders?.goalsLeader?.name?.split(' ').pop()} ${simData.leaders?.goalsLeader?.goals}G` },
          { label: "Assists Leader", val: `${simData.leaders?.assistsLeader?.name?.split(' ').pop()} ${simData.leaders?.assistsLeader?.assists}A` },
          { label: "Hart", val: `${simData.leaders?.hart?.name?.split(' ').pop()} ${simData.leaders?.hart?.pts}pts` },
          { label: "Norris", val: `${simData.leaders?.norris?.name?.split(' ').pop()} ${simData.leaders?.norris?.pts}pts` },
          { label: "Vezina", val: `${simData.leaders?.vezina?.name?.split(' ').pop()} ${simData.leaders?.vezina?.svp?.toFixed?.(3) ?? simData.leaders?.vezina?.svp}` },
          { label: "Calder", val: `${simData.leaders?.calder?.name?.split(' ').pop()} · ${simData.leaders?.calder?.team}` },
          { label: "Draft Lottery", val: `${simData.leaders?.draftLottery?.teamName} (${simData.leaders?.draftLottery?.projectedPoints}pts)` },
        ].map((s: any) => (
          <div key={s.label} style={{ background: 'var(--ledger-card)', border: '1px solid #b8a070', padding: '6px 8px' }}>
            <div style={{ fontSize: '6.5px', color: 'var(--ledger-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>{s.label}</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ledger-ink)' }}>{s.val}</div>
          </div>
        ))}
      </div>
    ),
  } : null;

  const playoffPage = simData?.playoffBracket ? {
    label: "Bracket",
    node: <PlayoffBracket bracket={simData.playoffBracket} />,
  } : null;

  const recapPage = simResult ? {
    label: "Recap",
    node: <div className="space-y-4">{simResult.split('\n').map(renderRecapLine)}</div>,
  } : null;

  const pages = [teamPage, leaguePage, playoffPage, recapPage].filter(Boolean) as Array<{ label: string; node: React.ReactNode }>;
  const activePage = pages[activeIndex] ?? pages[0];
  const goToPage = (nextIndex: number) => {
    if (!pages.length) return;
    const wrapped = (nextIndex + pages.length) % pages.length;
    setSlideDirection(wrapped > activeIndex || (activeIndex === pages.length - 1 && wrapped === 0) ? "next" : "prev");
    setActiveIndex(wrapped);
  };

  if (!activePage) return null;

  return (
    <div style={{ borderTop: '1px solid #b8a070', padding: '16px 20px 12px' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-ledger-ink-faint font-mono">
            Season Results
          </div>
          <div className="text-2xs text-ledger-rule font-mono mt-1">
            Simulation #{simData?.seed ?? "—"}
          </div>
        </div>
        {pages.length > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => goToPage(activeIndex - 1)} className="trade-file-arrow" aria-label="Previous season result">‹</button>
            <div className="text-[10px] font-black uppercase tracking-widest min-w-20 text-center" style={{ color: '#7f6740', fontFamily: "'Courier Prime', monospace" }}>
              {activeIndex + 1} / {pages.length}
            </div>
            <button onClick={() => goToPage(activeIndex + 1)} className="trade-file-arrow" aria-label="Next season result">›</button>
          </div>
        )}
      </div>

      {pages.length > 1 && (
        <div className="trade-file-tabs" aria-label="Season result sections">
          {pages.map((page, i) => (
            <button key={page.label} onClick={() => goToPage(i)} className={i === activeIndex ? "active" : ""}>
              {page.label}
            </button>
          ))}
        </div>
      )}

      <div key={`${activePage.label}-${slideDirection}`} className={`trade-file-card slide-${slideDirection}`} style={{ background: '#e8dab8', border: '1px solid #b8a070', padding: '12px' }}>
        {activePage.node}
      </div>
    </div>
  );
}

// ============================================================
// MICRO COMPONENTS
// ============================================================


export function MiniStat({ label, val }: { label: string; val: string }) {
  return (
    <div className="p-2 text-center">
      <div className="text-2xs font-black uppercase tracking-widest mb-0.5">{label}</div>
      <div className="text-[13px] font-black" style={{ color: 'var(--ledger-ink)',  }}>{val}</div>
    </div>
  );
}

