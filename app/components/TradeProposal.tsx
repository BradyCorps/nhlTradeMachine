"use client";

import { useState } from "react";

import type { Asset, Team } from "@/app/lib/trade-types";
import { mulberry32, scenarioSeed } from "@/app/lib/sim-engine";
import {
  TradeProposal,
  getNav,
  isDumpBlock,
  dumpFitScore,
  blockFitsTeam,
  buildDumpSweetener,
  buildReturnPackages,
  getMotivation,
  getRisk,
  preScreenProposal
} from "@/app/lib/trade-logic";

interface Props {
  outgoingBlock: Asset[];
  homeTeam:      Team | null;
  allTeams:      Team[];
  allPlayers:    Asset[];
  navMap:        Record<string, number>;
  onClose:       () => void;
  onLoadTrade:   (partner: Team, outgoing: Asset[], incoming: Asset[]) => void;
}

export default function TradeProposalEngine({
  outgoingBlock, homeTeam, allTeams, allPlayers, navMap, onClose, onLoadTrade
}: Props) {
  const [proposals,  setProposals]  = useState<TradeProposal[]>([]);
  const [generating, setGenerating] = useState(false);
  const [done,       setDone]       = useState(false);

  // Trade-block badge — shows why this player is realistically available
  const BlockBadge = ({ status }: { status?: string | null }) => {
    if (status !== "requested" && status !== "available") return null;
    const isReq = status === "requested";
    return (
      <span className="ml-1.5 text-[7px] font-black uppercase tracking-wider px-1 py-0.5 align-middle"
        style={{
          background: isReq ? 'rgba(184,48,32,0.10)' : 'rgba(148,105,20,0.12)',
          border: `1px solid ${isReq ? 'rgba(184,48,32,0.4)' : 'rgba(148,105,20,0.4)'}`,
          color: isReq ? '#b83020' : '#946914',
          fontFamily: "'Courier Prime', monospace",
        }}>
        {isReq ? "Trade Request" : "On the Block"}
      </span>
    );
  };

  const blockNav  = outgoingBlock.reduce((s, a) => s + (navMap[a.id] ?? 0), 0);
  const isDump    = isDumpBlock(outgoingBlock, navMap);
  const rdLabel   = (r?: number) => r===1?"1st":r===2?"2nd":r===3?"3rd":`${r}th`;
  const blockSummary = outgoingBlock.length === 1 ? outgoingBlock[0].name : `${outgoingBlock.length}-piece package`;

  // Home team's picks (for sweetening dumps)
  const homePicks = homeTeam
    ? allPlayers.filter(p => p.teamId === homeTeam.id && p.position === "Pick")
    : [];

  const generate = async () => {
    if (!homeTeam) return;
    setGenerating(true); setDone(false); setProposals([]);
    const rand = mulberry32(scenarioSeed({
      mode: "trade-proposal-engine",
      homeTeamId: homeTeam.id,
      outgoing: outgoingBlock.map(a => ({ id: a.id, retainedPct: a.retainedPct ?? 0 })),
      playerCount: allPlayers.length,
      teamCount: allTeams.length,
    }));

    const candidates: { team: Team; fitScore: number; homeSends: Asset[]; partnerSends: Asset[]; isDump: boolean; dumpSweetener: Asset[] }[] = [];

    const negNav = Math.abs(Math.min(0, blockNav));
    // Also check if this could be a neg-for-neg swap even if not a "dump"
    const hasNegPlayer = outgoingBlock.some(a => a.position !== "Pick" && getNav(a, navMap) < -5);

    for (const team of allTeams) {
      if (team.id === homeTeam.id) continue;
      const roster = allPlayers.filter(p => p.teamId === team.id && p.position !== "Pick");
      const picks  = allPlayers.filter(p => p.teamId === team.id && p.position === "Pick");
      const negPlayers = outgoingBlock.filter(a => a.position !== "Pick" && getNav(a, navMap) < -5);

      if (isDump) {
        // Salary dump: home sends bad contract + picks sweetener
        const fit = dumpFitScore(team, negPlayers, roster, navMap);
        if (fit < 20) continue;

        const sweetener = buildDumpSweetener(negNav, homePicks, navMap);

        const homeSends = [...outgoingBlock, ...sweetener];

        // Sometimes partner sends back a cheap depth player to make it a real trade
        const cheapReturn = roster
          .filter(p => !p.hasNMC && p.tradeBlockStatus !== "untouchable"
            && getNav(p, navMap) >= -10 && getNav(p, navMap) <= 20 && p.capHit < 2.5)
          .sort((a,b) => getNav(b,navMap)-getNav(a,navMap))[0];

        candidates.push({
          team, fitScore: fit,
          homeSends,
          partnerSends: cheapReturn ? [cheapReturn] : [],
          isDump: true,
          dumpSweetener: sweetener,
        });
      } else if (hasNegPlayer) {
        // Neg-for-neg swap: both teams trading contracts they want to move
        // Common in real NHL — teams swap bad contracts hoping for change of scenery
        const partnerNegPlayers = roster
          .filter(p => !p.hasNMC && p.tradeBlockStatus !== "untouchable"
            && getNav(p, navMap) < -5 && getNav(p, navMap) > -50)
          .sort((a,b) => getNav(b,navMap)-getNav(a,navMap));

        if (partnerNegPlayers.length === 0) {
          // Fall through to standard trade
          const fit = blockFitsTeam(team, outgoingBlock, roster, navMap);
          if (fit < 15) continue;
          const pkgs = buildReturnPackages(blockNav, roster, picks, navMap);
          if (pkgs.length === 0) continue;
          for (const pkg of pkgs.slice(0, 4)) {
            candidates.push({ team, fitScore: Math.round(fit * (0.85 + rand() * 0.15)), homeSends: outgoingBlock, partnerSends: pkg, isDump: false, dumpSweetener: [] });
          }
          continue;
        }

        // Find a partner neg player with similar NAV (within 40%)
        const homeNegNav = blockNav;
        const match = partnerNegPlayers.find(p => {
          const pNav = getNav(p, navMap);
          return Math.abs(pNav - homeNegNav) < Math.abs(homeNegNav) * 0.5 + 10;
        }) ?? partnerNegPlayers[0];

        // Cap must work both ways
        const homeCap = outgoingBlock.filter(a => a.position !== "Pick").reduce((s,a) => s + a.capHit*(1-(a.retainedPct||0)), 0);
        const partnerCap = match.capHit;
        if (team.capSpace + partnerCap < homeCap) continue;

        // Fit score: both teams want to move something
        const capSpaceBonus = team.capSpace > 5 ? 15 : 0;
        const posMatch = (() => {
          const hp = ["L","R"].includes(outgoingBlock[0]?.position) ? "W" : outgoingBlock[0]?.position;
          const pp = ["L","R"].includes(match.position) ? "W" : match.position;
          return hp !== pp ? 10 : 0; // different positions = more likely (no redundancy)
        })();
        const fit = Math.min(85, 50 + capSpaceBonus + posMatch);

        candidates.push({
          team, fitScore: fit,
          homeSends: outgoingBlock,
          partnerSends: [match],
          isDump: false,
          dumpSweetener: [],
        });
      } else {
        // Standard trade — generate multiple return packages per team
        const fit = blockFitsTeam(team, outgoingBlock, roster, navMap);
        if (fit < 15) continue;

        const pkgs = buildReturnPackages(blockNav, roster, picks, navMap);
        if (pkgs.length === 0) continue;

        // Add each valid package as a separate candidate
        // Cap at 4 packages per team to avoid one team dominating the pool
        for (const pkg of pkgs.slice(0, 4)) {
          // Slightly vary fitScore per package so weighted random picks different ones
          const pkgFit = Math.round(fit * (0.85 + rand() * 0.15));
          candidates.push({
            team, fitScore: pkgFit,
            homeSends: outgoingBlock,
            partnerSends: pkg,
            isDump: false,
            dumpSweetener: [],
          });
        }
      }
    }

    candidates.sort((a,b) => b.fitScore - a.fitScore);

    // Pre-screen — filter out proposals that would obviously be declined
    // Catches cap violations, NMC blocks, and self-defeating logic
    // before surfacing to the user. Better to show fewer clean proposals
    // than more with declined verdicts.
    const viable = candidates.filter(c =>
      preScreenProposal(c.homeSends, c.partnerSends, homeTeam!, c.team, navMap)
    );

    if (!viable.length) { setGenerating(false); setDone(true); return; }

    // Weighted random selection from top 10 viable candidates
    const weightedPick = (pool: typeof candidates, count: number) => {
      const picked: typeof candidates = [];
      const remaining = [...pool];
      while (picked.length < count && remaining.length > 0) {
        const totalWeight = remaining.reduce((s, c) => s + Math.pow(Math.max(1, c.fitScore), 1.5), 0);
        let r = rand() * totalWeight;
        let idx = 0;
        for (let i = 0; i < remaining.length; i++) {
          r -= Math.pow(Math.max(1, remaining[i].fitScore), 1.5);
          if (r <= 0) { idx = i; break; }
        }
        picked.push(remaining[idx]);
        remaining.splice(idx, 1);
      }
      return picked;
    };

    // Larger pool = more variety across runs
    const pool = viable.slice(0, Math.min(20, viable.length));
    const top  = weightedPick(pool, Math.min(3, pool.length));

    const initial: TradeProposal[] = top.map(c => ({
      partner:       c.team,
      homeSends:     c.homeSends,
      partnerSends:  c.partnerSends,
      fitScore:      c.fitScore,
      isDump:        c.isDump,
      dumpSweetener: c.dumpSweetener,
    }));
    setProposals(initial);
    setGenerating(false);
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,20,10,0.80)', backdropFilter: 'blur(3px)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        style={{ background: '#f0e6cc', border: '2px solid #b8a070', borderRadius: '3px' }}>

        {/* Header */}
        <div className="flex justify-between items-start p-4 sm:p-6" style={{ borderBottom: '2px solid #b8a070' }}>
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.4em] mb-1"
              style={{ color: isDump ? '#b83020' : '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              {isDump ? "⚠ Salary Dump — Searching Cap-Space Teams" : "Trade Request Generator"}
            </div>
            <div className="text-xl font-black" style={{ fontFamily: "'Libre Baskerville', serif", color: '#1c140a' }}>
              Find a trade for {blockSummary}
            </div>
            <div className="text-[10px] mt-1" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              {outgoingBlock.length > 1
                ? outgoingBlock.map((a: Asset) => `${a.name} (${a.position})`).join(" · ")
                : `${outgoingBlock[0]?.position} · Age ${outgoingBlock[0]?.age} · $${outgoingBlock[0]?.capHit}M`}
              {" "}· NAV {blockNav.toFixed(0)}
            </div>
            {isDump && (
              <div className="mt-2 text-[10px] font-bold" style={{ color: '#b83020', fontFamily: "'Courier Prime', monospace" }}>
                You will need to attach picks to move this contract.
                The engine will suggest the minimum sweetener required.
              </div>
            )}
          </div>
          <button onClick={onClose} className="font-bold text-xl transition-opacity hover:opacity-50 mt-1"
            style={{ color: '#9a7d58' }}>✕</button>
        </div>

        {!done && (
          <div className="p-4 sm:p-6">
            <button onClick={generate} disabled={generating}
              className="w-full py-3.5 font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 btn-stamp">
              {generating
                ? <><div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin"/>Searching 31 teams...</>
                : <>⚡ Generate Trade Proposals</>}
            </button>
          </div>
        )}

        {done && !proposals.length && (
          <div className="p-4 sm:p-6 text-center">
            <div className="text-sm font-bold" style={{ color: '#9a7d58' }}>No realistic trade partners found.</div>
            <div className="text-[10px] mt-1" style={{ color: '#b8a070', fontFamily: "'Courier Prime', monospace" }}>
              {isDump
                ? "No teams have enough cap space. Try retaining salary first — use the retention slider to lower the effective cap hit."
                : "Try adjusting the package — a player may have NMC, or the NAV gap is too large."}
            </div>
          </div>
        )}

        {proposals.length > 0 && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="text-[9px] font-black uppercase tracking-[0.4em] mb-4"
              style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
              {proposals.length} Trade Scenario{proposals.length > 1 ? "s" : ""}
            </div>

            {proposals.map((p, i) => {
              const homeNavOut  = p.homeSends.reduce((s,a) => s+(navMap[a.id]??0), 0);
              const partnerNavOut = p.partnerSends.reduce((s,a) => s+(navMap[a.id]??0), 0);

              return (
                <div key={i} className="p-4" style={{ background: '#e8dab8', border: '1px solid #b8a070', borderRadius: '2px' }}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-black text-sm" style={{ fontFamily: "'Libre Baskerville', serif", color: '#1c140a' }}>
                        {p.partner.name}
                      </div>
                      <div className="text-[9px] font-black uppercase tracking-wider mt-0.5"
                        style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                        {p.partner.phase} · #{p.partner.standing} · ${p.partner.capSpace.toFixed(1)}M cap
                        {p.isDump && <span style={{ color: '#b83020' }}> · ABSORBS CONTRACT</span>}
                      </div>
                    </div>
                    <div className="text-[10px] font-black px-2 py-1" style={{
                      background: p.fitScore>=70 ? 'rgba(36,94,57,0.15)' : p.fitScore>=50 ? 'rgba(148,105,20,0.15)' : 'rgba(184,48,32,0.1)',
                      border: `1px solid ${p.fitScore>=70 ? '#245e39' : p.fitScore>=50 ? '#946914' : '#b83020'}`,
                      color: p.fitScore>=70 ? '#245e39' : p.fitScore>=50 ? '#946914' : '#b83020',
                      fontFamily: "'Courier Prime', monospace",
                    }}>{p.fitScore}% fit</div>
                  </div>

                  <div className="proposal-sends">
                    {/* HOME SENDS */}
                    <div className="p-2.5" style={{ background: '#dfd0a8', border: '1px solid #b8a070' }}>
                      <div className="text-[11px] font-black uppercase tracking-wider mb-1.5"
                        style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                        {homeTeam?.name.split(" ").pop()} sends
                        {p.isDump && p.dumpSweetener.length > 0 &&
                          <span style={{ color: '#b83020' }}> (+ sweetener)</span>}
                      </div>
                      {p.homeSends.map((a,j) => {
                        const nav = navMap[a.id] ?? 0;
                        const isSweetener = p.dumpSweetener.some(s => s.id === a.id);
                        return (
                          <div key={j} className="mb-1.5">
                            <div className="text-[11px] font-bold leading-tight"
                              style={{ color: isSweetener ? '#245e39' : nav < 0 ? '#b83020' : '#1c140a' }}>
                              {a.position==="Pick" ? `${a.year} ${rdLabel(a.round)} Rd Pick` : a.name}
                              <span className="ml-1 font-mono text-[9px]" style={{ color: '#9a7d58' }}>
                                {a.position!=="Pick" && `$${a.capHit}M`}
                              </span>
                              <BlockBadge status={a.tradeBlockStatus} />
                              {isSweetener && <span className="ml-1 text-[11px]" style={{ color: '#245e39' }}>↑ sweetener</span>}
                            </div>
                            {a.position !== "Pick" && (
                              <div className="text-[11px] font-mono mt-0.5" style={{ color: '#9a7d58' }}>
                                {a.position} · Age {a.age}
                                {a.position === "G"
                                  ? ` · ${a.savePct?.toFixed(3) ?? "—"} SV%`
                                  : ` · ${a.ptsPace?.toFixed(0) ?? "—"} pts/82`}
                                {` · ${a.avgTOI?.toFixed(1) ?? "—"} TOI`}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="text-[10px] font-black font-mono mt-1.5" style={{ color: '#9a7d58' }}>
                        {homeNavOut.toFixed(0)} NAV total
                      </div>
                    </div>

                    <div className="proposal-swap-arrow" style={{ color: '#b8a070' }}>⇄</div>

                    {/* PARTNER SENDS */}
                    <div className="p-2.5" style={{ background: '#dfd0a8', border: '1px solid #b8a070' }}>
                      <div className="text-[11px] font-black uppercase tracking-wider mb-1.5"
                        style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                        {p.partner.name.split(" ").pop()} sends
                      </div>
                      {p.partnerSends.length === 0 ? (
                        <div className="text-[11px] font-bold italic" style={{ color: '#9a7d58' }}>
                          Cap space absorption only
                        </div>
                      ) : p.partnerSends.map((a,j) => (
                        <div key={j} className="mb-1.5">
                          <div className="text-[11px] font-bold leading-tight" style={{ color: '#1c140a' }}>
                            {a.position==="Pick" ? `${a.year} ${rdLabel(a.round)} Rd Pick` : a.name}
                            <span className="ml-1 font-mono text-[9px]" style={{ color: '#9a7d58' }}>
                              {a.position!=="Pick" && `$${a.capHit}M`}
                            </span>
                            <BlockBadge status={a.tradeBlockStatus} />
                          </div>
                          {a.position !== "Pick" && (
                            <div className="text-[11px] font-mono mt-0.5" style={{ color: '#9a7d58' }}>
                              {a.position} · Age {a.age}
                              {a.position === "G"
                                ? ` · ${a.savePct?.toFixed(3) ?? "—"} SV%`
                                : ` · ${a.ptsPace?.toFixed(0) ?? "—"} pts/82`}
                              {` · ${a.avgTOI?.toFixed(1) ?? "—"} TOI`}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="text-[10px] font-black font-mono mt-1.5"
                        style={{ color: p.isDump ? '#b83020' : '#245e39' }}>
                        {p.isDump ? "Cap relief for home" : `${partnerNavOut.toFixed(0)} NAV`}
                      </div>
                    </div>
                  </div>

                  {/* Motivation & Risk */}
                  {(() => {
                    const homeMotivation    = getMotivation(homeTeam!, p.homeSends, p.partnerSends, p.isDump, navMap);
                    const partnerMotivation = getMotivation(p.partner, p.partnerSends, p.homeSends, false, navMap);
                    const risk              = getRisk(p.homeSends, p.partnerSends, navMap);
                    return (
                      <div className="mb-3 space-y-1.5" style={{ borderTop: '1px solid #c8b890', paddingTop: '10px' }}>
                        <div className="flex gap-1.5 items-baseline">
                          <span className="text-[7px] font-black uppercase tracking-wider shrink-0 w-16"
                            style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                            {homeTeam?.name.split(" ").pop()}
                          </span>
                          <span className="text-[10px] leading-snug" style={{ color: '#3d2e18', fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic' }}>
                            {homeMotivation}
                          </span>
                        </div>
                        <div className="flex gap-1.5 items-baseline">
                          <span className="text-[7px] font-black uppercase tracking-wider shrink-0 w-16"
                            style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                            {p.partner.name.split(" ").pop()}
                          </span>
                          <span className="text-[10px] leading-snug" style={{ color: '#3d2e18', fontFamily: "'Libre Baskerville', serif", fontStyle: 'italic' }}>
                            {partnerMotivation}
                          </span>
                        </div>
                        {risk && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[7px] font-black px-1.5 py-0.5 uppercase tracking-wider"
                              style={{ background: 'rgba(184,48,32,0.10)', border: '1px solid rgba(184,48,32,0.35)', color: '#b83020', fontFamily: "'Courier Prime', monospace" }}>
                              ⚠ {risk.label}
                            </span>
                            <span className="text-[9px]" style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                              {risk.detail}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="text-[9px] font-black uppercase tracking-wider px-2 py-1" style={{
                      background: p.isDump ? 'rgba(184,48,32,0.08)' : 'rgba(43,63,102,0.08)',
                      border: `1px solid ${p.isDump ? 'rgba(184,48,32,0.3)' : 'rgba(43,63,102,0.3)'}`,
                      color: p.isDump ? '#b83020' : '#2b3f66',
                      fontFamily: "'Courier Prime', monospace",
                    }}>
                      {p.isDump
                        ? `${homeTeam?.name.split(" ").pop()} clears ${
                            outgoingBlock.filter((a: Asset) => a.position !== "Pick")
                              .reduce((s: number, a: Asset) => s + a.capHit*(1-(a.retainedPct||0)), 0).toFixed(1)
                          }M cap`
                        : `NAV: ${homeTeam?.name.split(" ").pop()} +${(partnerNavOut - homeNavOut).toFixed(0)}`}
                    </div>
                    <button
                      onClick={() => onLoadTrade(p.partner, p.homeSends, p.partnerSends)}
                      className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 btn-stamp">
                      Load into Trade Machine ↗
                    </button>
                  </div>

                </div>
              );
            })}

            <button onClick={() => { setDone(false); setProposals([]); }}
              className="w-full py-2.5 font-black text-[10px] uppercase tracking-widest transition-colors btn-ghost mt-2">
              Generate New Proposals
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
