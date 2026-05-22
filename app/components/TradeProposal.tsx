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
  partner:     Team;
  gives:       Asset[];
  receives:    Asset[];
  navGives:    number;
  navReceives: number;
  fitScore:    number;
  narrative:   string;
  loading:     boolean;
}

const getNav = (a: Asset, navMap: Record<string, number>): number => navMap[a.id] ?? 0;

// Score how well a team fits the ENTIRE outgoing block
const blockFitsTeam = (team: Team, block: Asset[], teamRoster: Asset[], navMap: Record<string, number>): number => {
  let score = 0;
  const phase = team.phase ?? "Retooling";

  // Total NAV of the block
  const blockNav = block.reduce((s, a) => s + getNav(a, navMap), 0);

  // Cap space check — can they absorb the incoming cap?
  const blockCap = block.filter(a => a.position !== "Pick").reduce((s, a) => s + a.capHit, 0);
  if (team.capSpace >= blockCap) score += 15;
  else if (team.capSpace >= blockCap * 0.5) score += 5;
  else score -= 20;

  // Evaluate each player in the block individually
  for (const player of block) {
    if (player.position === "Pick") {
      // Rebuilding/retooling teams love picks
      if (phase === "Rebuilding" || phase === "Tanking") score += 15;
      else if (phase === "Retooling") score += 8;
      continue;
    }

    const pos = player.position === "L" || player.position === "R" ? "W" : player.position;

    // Phase fit per player
    if (player.age <= 28 && (phase === "Rebuilding" || phase === "Retooling")) score += 15;
    if (player.age >= 27 && player.age <= 33 && (phase === "Contender" || phase === "Bubble")) score += 15;
    if (player.age > 33 && (phase === "Rebuilding" || phase === "Tanking")) score -= 15;

    // Positional need
    const posCount = teamRoster.filter(p => {
      const pp = p.position === "L" || p.position === "R" ? "W" : p.position;
      return pp === pos;
    }).length;
    if (posCount < 3) score += 20;
    else if (posCount < 5) score += 8;

    // Explicit need match
    if (team.needs?.some(n => n.pos === pos)) score += 15;

    // NMC risk
    if (player.hasNMC) score -= 8;
  }

  return Math.max(0, Math.min(100, score));
};

const buildReturnPackage = (
  targetNAV: number,
  roster:    Asset[],
  picks:     Asset[],
  navMap:    Record<string, number>,
): Asset[] | null => {
  const n = (a: Asset) => getNav(a, navMap);
  const tradeable = roster
    .filter(p => !p.hasNMC && p.position !== "Pick" && n(p) > 5)
    .sort((a, b) => n(b) - n(a));
  const sortedPicks = [...picks]
    .filter(p => (p.year ?? 9999) <= 2027)
    .sort((a, b) => n(b) - n(a));

  const low  = targetNAV * 0.70;
  const high = targetNAV * 1.30;
  const fits = (v: number) => v >= low && v <= high;
  const fwds = tradeable.filter(p => ["W","C","L","R"].includes(p.position));
  const dmen = tradeable.filter(p => p.position === "D");

  // 1. Single player
  for (const p of tradeable) if (fits(n(p))) return [p];

  // 2. Forward + picks
  for (const f of fwds.slice(0,8)) {
    const fv = n(f);
    for (const pk of sortedPicks) if (fits(fv+n(pk))) return [f,pk];
    for (let i=0;i<sortedPicks.length;i++)
      for (let j=i+1;j<sortedPicks.length;j++)
        if (fits(fv+n(sortedPicks[i])+n(sortedPicks[j]))) return [f,sortedPicks[i],sortedPicks[j]];
    for (let i=0;i<Math.min(sortedPicks.length,4);i++)
      for (let j=i+1;j<Math.min(sortedPicks.length,4);j++)
        for (let k=j+1;k<Math.min(sortedPicks.length,4);k++)
          if (fits(fv+n(sortedPicks[i])+n(sortedPicks[j])+n(sortedPicks[k])))
            return [f,sortedPicks[i],sortedPicks[j],sortedPicks[k]];
  }

  // 3. D + picks
  for (const d of dmen.slice(0,5)) {
    const dv = n(d);
    for (const pk of sortedPicks) if (fits(dv+n(pk))) return [d,pk];
    for (let i=0;i<sortedPicks.length;i++)
      for (let j=i+1;j<sortedPicks.length;j++)
        if (fits(dv+n(sortedPicks[i])+n(sortedPicks[j]))) return [d,sortedPicks[i],sortedPicks[j]];
  }

  // 4. Forward + D + pick
  for (const f of fwds.slice(0,5))
    for (const d of dmen.slice(0,5)) {
      const base = n(f)+n(d);
      if (fits(base)) return [f,d];
      for (const pk of sortedPicks) if (fits(base+n(pk))) return [f,d,pk];
    }

  // 5. Picks only
  let pnav=0; const pkg:Asset[]=[];
  for (const pk of sortedPicks) {
    pkg.push(pk); pnav+=n(pk);
    if (fits(pnav)) return [...pkg];
    if (pkg.length>=5) break;
  }

  // 6. Two forwards
  for (let i=0;i<fwds.length;i++)
    for (let j=i+1;j<fwds.length;j++)
      if (fits(n(fwds[i])+n(fwds[j]))) return [fwds[i],fwds[j]];

  return null;
};

const generateNarrative = async (
  outgoingBlock: Asset[],
  homeTeam:      Team,
  partnerTeam:   Team,
  gives:         Asset[],
  navGives:      number,
  navReceives:   number,
): Promise<string> => {
  const blockDesc  = outgoingBlock.map(a =>
    a.position === "Pick"
      ? `${a.year} ${a.round===1?"1st":a.round===2?"2nd":"3rd"} round pick`
      : `${a.name} ($${a.capHit}M, age ${a.age}, ${a.position})`
  ).join(" + ");
  const givesDesc  = gives.map(a =>
    a.position === "Pick"
      ? `${a.year} ${a.round===1?"1st":a.round===2?"2nd":a.round===3?"3rd":`${a.round}th`} round pick`
      : `${a.name} ($${a.capHit}M, age ${a.age})`
  ).join(" + ");

  try {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 120,
        messages: [{ role: "user", content:
          `NHL GM analyst. Max 2 sentences, max 80 words. Be precise about which team gets what.\n\nTrade: ${homeTeam.name} sends [${blockDesc}] to ${partnerTeam.name}. ${partnerTeam.name} sends [${givesDesc}] to ${homeTeam.name}.\nNAV: ${homeTeam.name} receives ${navGives.toFixed(0)} NAV, gives ${navReceives.toFixed(0)} NAV.\n${homeTeam.name}: ${homeTeam.phase} #${homeTeam.standing}. ${partnerTeam.name}: ${partnerTeam.phase} #${partnerTeam.standing}.\n\nWhy does this work for both teams?`
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

export default function TradeProposalEngine({ outgoingBlock, homeTeam, allTeams, allPlayers, navMap, onClose, onLoadTrade }: Props) {
  const [proposals,  setProposals]  = useState<TradeProposal[]>([]);
  const [generating, setGenerating] = useState(false);
  const [done,       setDone]       = useState(false);

  const blockNav   = outgoingBlock.reduce((s, a) => s + (navMap[a.id] ?? 0), 0);
  const rdLabel    = (r?: number) => r===1?"1st":r===2?"2nd":r===3?"3rd":`${r}th`;

  // Describe the outgoing block concisely
  const blockSummary = outgoingBlock.length === 1
    ? outgoingBlock[0].name
    : `${outgoingBlock.length}-piece package`;

  const generate = async () => {
    if (!homeTeam) return;
    setGenerating(true); setDone(false); setProposals([]);

    const candidates: { team: Team; fitScore: number; pkg: Asset[] }[] = [];

    for (const team of allTeams) {
      if (team.id === homeTeam.id) continue;
      const roster = allPlayers.filter(p => p.teamId === team.id && p.position !== "Pick");
      const picks  = allPlayers.filter(p => p.teamId === team.id && p.position === "Pick");
      const fit    = blockFitsTeam(team, outgoingBlock, roster, navMap);
      if (fit < 15) continue;
      const pkg = buildReturnPackage(blockNav, roster, picks, navMap);
      if (pkg) candidates.push({ team, fitScore: fit, pkg });
    }

    candidates.sort((a,b) => b.fitScore - a.fitScore);
    const top = candidates.slice(0,5);

    if (!top.length) { setGenerating(false); setDone(true); return; }

    const initial: TradeProposal[] = top.map(c => ({
      partner:     c.team,
      gives:       c.pkg,
      receives:    outgoingBlock,
      navGives:    c.pkg.reduce((s,a) => s+(navMap[a.id]??0), 0),
      navReceives: blockNav,
      fitScore:    c.fitScore,
      narrative:   "",
      loading:     true,
    }));
    setProposals(initial);
    setGenerating(false);

    const narratives = await Promise.all(top.map(c =>
      generateNarrative(outgoingBlock, homeTeam, c.team, c.pkg,
        c.pkg.reduce((s,a)=>s+(navMap[a.id]??0),0), blockNav)
    ));
    setProposals(prev => prev.map((p,i) => ({ ...p, narrative: narratives[i], loading: false })));
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

        <div className="flex justify-between items-start p-6 border-b border-zinc-800">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.4em] text-cyan-600 mb-1">Trade Request Generator</div>
            <div className="text-xl font-black text-white">Find a trade for {blockSummary}</div>
            <div className="text-[10px] text-zinc-600 mt-1 font-mono">
              {outgoingBlock.length > 1
                ? outgoingBlock.map(a => `${a.name} (${a.position})`).join(" · ")
                : `${outgoingBlock[0]?.position} · Age ${outgoingBlock[0]?.age} · $${outgoingBlock[0]?.capHit}M`}
              {" "}· NAV {blockNav.toFixed(0)}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-white transition-colors text-xl font-bold mt-1">✕</button>
        </div>

        {!done && (
          <div className="p-6">
            <button onClick={generate} disabled={generating}
              className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest bg-cyan-950 border border-cyan-800 text-cyan-400 hover:bg-cyan-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all">
              {generating
                ? <><div className="w-3 h-3 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin"/>Searching 31 teams...</>
                : <>⚡ Generate Trade Proposals</>}
            </button>
            <p className="text-center text-[10px] text-zinc-700 mt-3 font-bold uppercase tracking-wider">
              Evaluates the full package · Searches all 31 teams · Claude GM analysis
            </p>
          </div>
        )}

        {done && !proposals.length && (
          <div className="p-6 text-center">
            <div className="text-zinc-500 text-sm font-bold">No realistic trade partners found.</div>
            <div className="text-zinc-700 text-[10px] mt-1">Try adjusting the package — a player may have NMC, or the NAV is hard to match.</div>
          </div>
        )}

        {proposals.length > 0 && (
          <div className="p-6 space-y-4">
            <div className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-4">{proposals.length} Trade Scenarios</div>

            {proposals.map((p, i) => {
              const diff     = p.navGives - p.navReceives;
              const balanced = Math.abs(diff) < Math.abs(p.navReceives) * 0.15;
              return (
                <div key={i} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-black text-white text-sm">{p.partner.name}</div>
                      <div className="text-[9px] text-zinc-600 font-black uppercase tracking-wider mt-0.5">
                        {p.partner.phase} · #{p.partner.standing} · ${p.partner.capSpace}M cap
                      </div>
                    </div>
                    <div className={`text-xs font-black px-2.5 py-1 rounded-lg border ${
                      p.fitScore>=70?"bg-emerald-950/50 border-emerald-800 text-emerald-400":
                      p.fitScore>=50?"bg-amber-950/50 border-amber-800 text-amber-400":
                      "bg-zinc-800 border-zinc-700 text-zinc-500"
                    }`}>{p.fitScore}% fit</div>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-3">
                    <div className="bg-zinc-800/50 rounded-lg p-2.5">
                      <div className="text-[8px] font-black uppercase tracking-wider text-zinc-600 mb-1.5">{p.partner.name.split(" ").pop()} sends</div>
                      {p.gives.map((a,j) => (
                        <div key={j} className="text-[11px] font-bold text-zinc-300 leading-tight">
                          {a.position==="Pick" ? `${a.year} ${rdLabel(a.round)} Rd` : a.name}
                          {a.position!=="Pick" && <span className="text-zinc-600 ml-1 font-mono text-[9px]">${a.capHit}M</span>}
                        </div>
                      ))}
                      <div className={`text-[10px] font-black font-mono mt-1.5 ${diff>=0?"text-emerald-400":"text-rose-400"}`}>
                        {p.navGives.toFixed(0)} NAV
                      </div>
                    </div>
                    <div className="text-zinc-700 text-lg font-bold text-center">⇄</div>
                    <div className="bg-zinc-800/50 rounded-lg p-2.5">
                      <div className="text-[8px] font-black uppercase tracking-wider text-zinc-600 mb-1.5">{homeTeam?.name.split(" ").pop()} sends</div>
                      {outgoingBlock.map((a,j) => (
                        <div key={j} className="text-[11px] font-bold text-white leading-tight">
                          {a.position==="Pick" ? `${a.year} ${rdLabel(a.round)} Rd` : a.name}
                          {a.position!=="Pick" && <span className="text-zinc-600 ml-1 font-mono text-[9px]">${a.capHit}M</span>}
                        </div>
                      ))}
                      <div className="text-[10px] font-black font-mono mt-1.5 text-zinc-400">{p.navReceives.toFixed(0)} NAV</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md inline-block ${
                      balanced?"bg-sky-950/50 text-sky-500 border border-sky-900":
                      diff>0?"bg-emerald-950/50 text-emerald-500 border border-emerald-900":
                      "bg-rose-950/50 text-rose-500 border border-rose-900"
                    }`}>
                      {balanced?"⚖ Balanced":diff>0?`↑ +${diff.toFixed(0)} NAV for home`:`↓ ${diff.toFixed(0)} NAV for home`}
                    </div>
                    <button
                      onClick={() => onLoadTrade(p.partner, outgoingBlock, p.gives)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white text-black hover:bg-cyan-400 transition-all active:scale-95"
                    >
                      Load into Trade Machine ↗
                    </button>
                  </div>

                  {p.loading ? (
                    <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                      <div className="w-2.5 h-2.5 rounded-full border border-zinc-600 border-t-transparent animate-spin"/>
                      Generating GM analysis...
                    </div>
                  ) : p.narrative ? (
                    <div className="text-[11px] text-zinc-400 leading-relaxed border-t border-zinc-800/50 pt-3 mt-1 italic">
                      "{p.narrative}"
                    </div>
                  ) : null}
                </div>
              );
            })}

            <button onClick={() => { setDone(false); setProposals([]); }}
              className="w-full py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 border border-zinc-800 hover:border-zinc-700 transition-colors mt-2">
              Generate New Proposals
            </button>
          </div>
        )}
      </div>
    </div>
  );
}