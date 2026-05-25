"use client";

import { useState } from "react";

interface Asset {
  id: string;
  teamId: string;
  name: string;
  position: string;
  age: number;
  ptsPace: number;
  avgTOI: number;
  capHit: number;
  yearsRemaining: number;
  games: number;
  defRate: number;
  canRetain: boolean;
  retainedPct: number;
  multiplier: number;
  hasNMC: boolean;
  hasNTC: boolean;
  round?: number;
  year?: number;
  teamStanding?: number;
  gsax?: number;
  [key: string]: any;
}

interface Team {
  id: string;
  name: string;
  capSpace: number;
  standing: number;
  phase?: string;
  needs?: { pos: string; minWar: number; label: string }[];
}

interface TradeProposal {
  partner:        Team;
  // What HOME sends to partner (negative player + picks sweetener)
  homeSends:      Asset[];
  // What PARTNER sends back (player of similar value, or nothing for pure dumps)
  partnerSends:   Asset[];
  fitScore:       number;
  narrative:      string;
  loading:        boolean;
  isDump:         boolean;
  dumpSweetener:  Asset[]; // picks HOME adds to sweeten the dump
}

const getNav = (a: Asset, navMap: Record<string, number>): number => navMap[a.id] ?? 0;

const isDumpBlock = (block: Asset[], navMap: Record<string, number>): boolean => {
  const players = block.filter(a => a.position !== "Pick");
  if (players.length === 0) return false;
  const totalNav = players.reduce((s, a) => s + getNav(a, navMap), 0);
  const hasNegative = players.some(a => getNav(a, navMap) < -5);
  return hasNegative && totalNav < 15;
};

// Score how willing a team is to absorb a negative contract
const dumpFitScore = (
  team: Team,
  negPlayers: Asset[],
  teamRoster: Asset[],
  navMap: Record<string, number>,
): number => {
  let score = 0;
  const phase = team.phase ?? "Retooling";
  const totalCap = negPlayers.reduce((s, a) => s + a.capHit * (1-(a.retainedPct||0)), 0);

  // Must have cap space
  if (team.capSpace < totalCap) return 0;
  if (team.capSpace >= totalCap + 8) score += 35;
  else if (team.capSpace >= totalCap + 3) score += 20;
  else score += 5;

  // Rebuilding/tanking teams absorb bad contracts for picks regularly
  if (phase === "Rebuilding" || phase === "Tanking") score += 30;
  else if (phase === "Retooling") score += 15;
  else score -= 10; // contenders rarely take on bad contracts

  // Check if they actually need the position
  for (const p of negPlayers) {
    const pos = ["L","R"].includes(p.position) ? "W" : p.position;
    const posCount = teamRoster.filter(r => {
      const rp = ["L","R"].includes(r.position) ? "W" : r.position;
      return rp === pos;
    }).length;
    if (posCount < 3) score += 20; // real positional need
    if (team.needs?.some(n => n.pos === pos)) score += 15;
    // Age factor — younger bad contracts are more palatable
    if (p.age <= 28) score += 10;
    if (p.age > 33) score -= 15;
  }

  return Math.max(0, Math.min(100, score));
};

// Score standard trade fit
const blockFitsTeam = (
  team: Team,
  block: Asset[],
  teamRoster: Asset[],
  navMap: Record<string, number>,
): number => {
  let score = 0;
  const phase = team.phase ?? "Retooling";
  const blockCap = block.filter(a => a.position !== "Pick")
    .reduce((s, a) => s + a.capHit * (1-(a.retainedPct||0)), 0);

  if (team.capSpace >= blockCap) score += 15;
  else if (team.capSpace >= blockCap * 0.5) score += 5;
  else score -= 20;

  for (const player of block) {
    if (player.position === "Pick") {
      if (phase === "Rebuilding" || phase === "Tanking") score += 15;
      else if (phase === "Retooling") score += 8;
      continue;
    }
    const pos = ["L","R"].includes(player.position) ? "W" : player.position;
    if (player.age <= 28 && (phase === "Rebuilding" || phase === "Retooling")) score += 15;
    if (player.age >= 27 && player.age <= 33 && (phase === "Contender" || phase === "Bubble")) score += 15;
    if (player.age > 33 && (phase === "Rebuilding" || phase === "Tanking")) score -= 15;
    const posCount = teamRoster.filter(p => {
      const pp = ["L","R"].includes(p.position) ? "W" : p.position;
      return pp === pos;
    }).length;
    if (posCount < 3) score += 20;
    else if (posCount < 5) score += 8;
    if (team.needs?.some(n => n.pos === pos)) score += 15;
    if (player.hasNMC) score -= 8;
  }

  return Math.max(0, Math.min(100, score));
};

// Build picks sweetener HOME adds to make dump palatable
// Calibrated to be realistic — teams won't give away 2 firsts for a bad contract
const buildDumpSweetener = (
  negNav:    number,  // absolute value of how negative
  homePicks: Asset[],
  navMap:    Record<string, number>,
): Asset[] => {
  const sortedPicks = [...homePicks]
    .filter(p => (p.year ?? 9999) <= 2028)
    .sort((a, b) => getNav(b, navMap) - getNav(a, navMap));

  // Realistic sweetener calibration:
  // NAV -5 to -15: 1 late pick or 2nd round
  // NAV -15 to -25: 1 mid pick
  // NAV -25 to -35: 1 good pick
  // NAV -35+: 1 first + 1 second MAX — no rational GM gives 2 firsts for cap relief
  const pkg: Asset[] = [];
  let total = 0;
  const maxPicks = negNav > 35 ? 2 : 1;  // hard cap at 2 picks regardless

  for (const pk of sortedPicks) {
    // Don't use top-tier picks (NAV > 50) as sweetener — that's overpaying
    if (getNav(pk, navMap) > 50) continue;
    pkg.push(pk);
    total += getNav(pk, navMap);
    if (pkg.length >= maxPicks) break;
    if (total >= negNav * 0.8) break;  // stop once sweetener covers ~80% of deficit
  }
  return pkg;
};

// Build return package for standard trades (partner sends back value)
const buildReturnPackage = (
  targetNAV:  number,
  roster:     Asset[],
  picks:      Asset[],
  navMap:     Record<string, number>,
): Asset[] | null => {
  const n = (a: Asset) => getNav(a, navMap);
  // Include marginal negative players as "change of scenery" candidates in packages
  const tradeable = roster
    .filter(p => !p.hasNMC && p.position !== "Pick" && n(p) > -15)
    .sort((a, b) => n(b) - n(a));
  const sortedPicks = [...picks]
    .filter(p => (p.year ?? 9999) <= 2028)
    .sort((a, b) => n(b) - n(a));

  const low  = targetNAV * 0.70;
  const high = targetNAV * 1.30;
  const fits = (v: number) => v >= low && v <= high;
  const fwds = tradeable.filter(p => ["W","C","L","R"].includes(p.position));
  const dmen = tradeable.filter(p => p.position === "D");

  for (const p of tradeable) if (fits(n(p))) return [p];
  for (const f of fwds.slice(0,8)) {
    const fv = n(f);
    for (const pk of sortedPicks) if (fits(fv+n(pk))) return [f,pk];
    for (let i=0;i<sortedPicks.length;i++)
      for (let j=i+1;j<sortedPicks.length;j++)
        if (fits(fv+n(sortedPicks[i])+n(sortedPicks[j]))) return [f,sortedPicks[i],sortedPicks[j]];
  }
  for (const d of dmen.slice(0,5)) {
    const dv = n(d);
    for (const pk of sortedPicks) if (fits(dv+n(pk))) return [d,pk];
    for (let i=0;i<sortedPicks.length;i++)
      for (let j=i+1;j<sortedPicks.length;j++)
        if (fits(dv+n(sortedPicks[i])+n(sortedPicks[j]))) return [d,sortedPicks[i],sortedPicks[j]];
  }
  for (const f of fwds.slice(0,5))
    for (const d of dmen.slice(0,5)) {
      const base = n(f)+n(d);
      if (fits(base)) return [f,d];
      for (const pk of sortedPicks) if (fits(base+n(pk))) return [f,d,pk];
    }
  let pnav=0; const pkg:Asset[]=[];
  for (const pk of sortedPicks) {
    pkg.push(pk); pnav+=n(pk);
    if (fits(pnav)) return [...pkg];
    if (pkg.length>=5) break;
  }
  for (let i=0;i<fwds.length;i++)
    for (let j=i+1;j<fwds.length;j++)
      if (fits(n(fwds[i])+n(fwds[j]))) return [fwds[i],fwds[j]];
  return null;
};

const generateNarrative = async (
  homeSends:    Asset[],
  partnerSends: Asset[],
  homeTeam:     Team,
  partnerTeam:  Team,
  isDump:       boolean,
  navMap:       Record<string, number>,
): Promise<string> => {
  const rdLabel = (r?: number) => r===1?"1st":r===2?"2nd":r===3?"3rd":`${r}th`;
  const descAssets = (assets: Asset[]) => assets.map(a =>
    a.position === "Pick"
      ? `${a.year} ${rdLabel(a.round)} round pick (NAV ${getNav(a,navMap).toFixed(0)})`
      : `${a.name} ($${a.capHit}M, age ${a.age}, ${a.position}, NAV ${getNav(a,navMap).toFixed(0)})`
  ).join(" + ") || "nothing";

  const context = isDump
    ? `This is a salary cap dump. ${homeTeam.name} needs to clear cap space and is willing to include picks to move the bad contract. ${partnerTeam.name} absorbs the contract because they have cap room and get draft capital. Focus on: why does each side agree to this? What does the pick sweetener mean for the rebuilding team?`
    : `Standard player trade. Why does this make sense for both teams given their phases and roster needs?`;

  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 130,
        messages: [{
          role: "user",
          content: `NHL GM analyst. 2 sentences max, 100 words max.\n\n${homeTeam.name} (${homeTeam.phase}, #${homeTeam.standing}) sends [${descAssets(homeSends)}] to ${partnerTeam.name}.\n${partnerTeam.name} (${partnerTeam.phase}, #${partnerTeam.standing}) sends [${descAssets(partnerSends)}] to ${homeTeam.name}.\n\n${context}`
        }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text ?? "Analysis unavailable.";
  } catch { return "Analysis unavailable."; }
};

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
          .filter(p => !p.hasNMC && getNav(p, navMap) >= -10 && getNav(p, navMap) <= 20 && p.capHit < 2.5)
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
          .filter(p => !p.hasNMC && getNav(p, navMap) < -5 && getNav(p, navMap) > -50)
          .sort((a,b) => getNav(b,navMap)-getNav(a,navMap));

        if (partnerNegPlayers.length === 0) {
          // Fall through to standard trade
          const fit = blockFitsTeam(team, outgoingBlock, roster, navMap);
          if (fit < 15) continue;
          const pkg = buildReturnPackage(blockNav, roster, picks, navMap);
          if (!pkg) continue;
          candidates.push({ team, fitScore: fit, homeSends: outgoingBlock, partnerSends: pkg, isDump: false, dumpSweetener: [] });
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
        // Standard trade
        const fit = blockFitsTeam(team, outgoingBlock, roster, navMap);
        if (fit < 15) continue;
        const pkg = buildReturnPackage(blockNav, roster, picks, navMap);
        if (!pkg) continue;
        candidates.push({ team, fitScore: fit, homeSends: outgoingBlock, partnerSends: pkg, isDump: false, dumpSweetener: [] });
      }
    }

    candidates.sort((a,b) => b.fitScore - a.fitScore);
    const top = candidates.slice(0,5);
    if (!top.length) { setGenerating(false); setDone(true); return; }

    const initial: TradeProposal[] = top.map(c => ({
      partner:       c.team,
      homeSends:     c.homeSends,
      partnerSends:  c.partnerSends,
      fitScore:      c.fitScore,
      narrative:     "",
      loading:       true,
      isDump:        c.isDump,
      dumpSweetener: c.dumpSweetener,
    }));
    setProposals(initial);
    setGenerating(false);

    const narratives = await Promise.all(top.map(c =>
      generateNarrative(c.homeSends, c.partnerSends, homeTeam, c.team, c.isDump, navMap)
    ));
    setProposals(prev => prev.map((p,i) => ({ ...p, narrative: narratives[i], loading: false })));
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,20,10,0.80)', backdropFilter: 'blur(3px)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        style={{ background: '#f0e6cc', border: '2px solid #b8a070', borderRadius: '3px' }}>

        {/* Header */}
        <div className="flex justify-between items-start p-6" style={{ borderBottom: '2px solid #b8a070' }}>
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
                ? outgoingBlock.map(a => `${a.name} (${a.position})`).join(" · ")
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
          <div className="p-6">
            <button onClick={generate} disabled={generating}
              className="w-full py-3.5 font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 btn-stamp">
              {generating
                ? <><div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin"/>Searching 31 teams...</>
                : <>⚡ Generate Trade Proposals</>}
            </button>
          </div>
        )}

        {done && !proposals.length && (
          <div className="p-6 text-center">
            <div className="text-sm font-bold" style={{ color: '#9a7d58' }}>No realistic trade partners found.</div>
            <div className="text-[10px] mt-1" style={{ color: '#b8a070', fontFamily: "'Courier Prime', monospace" }}>
              {isDump
                ? "No teams have enough cap space. Try retaining salary first — use the retention slider to lower the effective cap hit."
                : "Try adjusting the package — a player may have NMC, or the NAV gap is too large."}
            </div>
          </div>
        )}

        {proposals.length > 0 && (
          <div className="p-6 space-y-4">
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

                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start mb-3">
                    {/* HOME SENDS */}
                    <div className="p-2.5" style={{ background: '#dfd0a8', border: '1px solid #b8a070' }}>
                      <div className="text-[8px] font-black uppercase tracking-wider mb-1.5"
                        style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                        {homeTeam?.name.split(" ").pop()} sends
                        {p.isDump && p.dumpSweetener.length > 0 &&
                          <span style={{ color: '#b83020' }}> (+ sweetener)</span>}
                      </div>
                      {p.homeSends.map((a,j) => {
                        const nav = navMap[a.id] ?? 0;
                        const isSweetener = p.dumpSweetener.some(s => s.id === a.id);
                        return (
                          <div key={j} className="text-[11px] font-bold leading-tight mb-0.5"
                            style={{ color: isSweetener ? '#245e39' : nav < 0 ? '#b83020' : '#1c140a' }}>
                            {a.position==="Pick" ? `${a.year} ${rdLabel(a.round)} Rd Pick` : a.name}
                            {a.position!=="Pick" && (
                              <span className="ml-1 font-mono text-[9px]" style={{ color: '#9a7d58' }}>${a.capHit}M</span>
                            )}
                            {isSweetener && <span className="ml-1 text-[8px]" style={{ color: '#245e39' }}>↑ sweetener</span>}
                          </div>
                        );
                      })}
                      <div className="text-[10px] font-black font-mono mt-1.5" style={{ color: '#9a7d58' }}>
                        {homeNavOut.toFixed(0)} NAV total
                      </div>
                    </div>

                    <div className="text-lg font-bold text-center self-center" style={{ color: '#b8a070' }}>⇄</div>

                    {/* PARTNER SENDS */}
                    <div className="p-2.5" style={{ background: '#dfd0a8', border: '1px solid #b8a070' }}>
                      <div className="text-[8px] font-black uppercase tracking-wider mb-1.5"
                        style={{ color: '#9a7d58', fontFamily: "'Courier Prime', monospace" }}>
                        {p.partner.name.split(" ").pop()} sends
                      </div>
                      {p.partnerSends.length === 0 ? (
                        <div className="text-[11px] font-bold italic" style={{ color: '#9a7d58' }}>
                          Cap space absorption only
                        </div>
                      ) : p.partnerSends.map((a,j) => (
                        <div key={j} className="text-[11px] font-bold leading-tight mb-0.5" style={{ color: '#1c140a' }}>
                          {a.position==="Pick" ? `${a.year} ${rdLabel(a.round)} Rd Pick` : a.name}
                          {a.position!=="Pick" && (
                            <span className="ml-1 font-mono text-[9px]" style={{ color: '#9a7d58' }}>${a.capHit}M</span>
                          )}
                        </div>
                      ))}
                      <div className="text-[10px] font-black font-mono mt-1.5"
                        style={{ color: p.isDump ? '#b83020' : '#245e39' }}>
                        {p.isDump ? "Cap relief for home" : `${partnerNavOut.toFixed(0)} NAV`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="text-[9px] font-black uppercase tracking-wider px-2 py-1" style={{
                      background: p.isDump ? 'rgba(184,48,32,0.08)' : 'rgba(43,63,102,0.08)',
                      border: `1px solid ${p.isDump ? 'rgba(184,48,32,0.3)' : 'rgba(43,63,102,0.3)'}`,
                      color: p.isDump ? '#b83020' : '#2b3f66',
                      fontFamily: "'Courier Prime', monospace",
                    }}>
                      {p.isDump
                        ? `${homeTeam?.name.split(" ").pop()} clears ${
                            outgoingBlock.filter(a=>a.position!=="Pick")
                              .reduce((s,a)=>s+a.capHit*(1-(a.retainedPct||0)),0).toFixed(1)
                          }M cap`
                        : `NAV: ${homeTeam?.name.split(" ").pop()} +${(partnerNavOut - homeNavOut).toFixed(0)}`}
                    </div>
                    <button
                      onClick={() => onLoadTrade(p.partner, p.homeSends, p.partnerSends)}
                      className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 btn-stamp">
                      Load into Trade Machine ↗
                    </button>
                  </div>

                  {p.loading ? (
                    <div className="flex items-center gap-2 text-[10px]" style={{ color: '#9a7d58' }}>
                      <div className="w-2.5 h-2.5 rounded-full border border-t-transparent animate-spin"
                        style={{ borderColor: '#b83020', borderTopColor: 'transparent' }}/>
                      Generating GM analysis...
                    </div>
                  ) : p.narrative ? (
                    <div className="text-[11px] leading-relaxed pt-3 mt-1 italic"
                      style={{ color: '#4a3820', borderTop: '1px solid #c8b890', fontFamily: "'Libre Baskerville', serif" }}>
                      "{p.narrative}"
                    </div>
                  ) : null}
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