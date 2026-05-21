"use client";

// ============================================================
// CAP PROJECTION PANEL
// Shows both rosters before and after the trade, with cap
// space, position depth, and lineup health visualised.
// ============================================================

interface Asset {
  id: string;
  name: string;
  position: string;
  age: number;
  ptsPace: number;
  avgTOI: number;
  capHit: number;
  yearsRemaining: number;
  games: number;
  teamId: string;
  headshot?: string;
  [key: string]: any;
}

interface Team {
  id: string;
  name: string;
  capSpace: number;
  standing: number;
  phase?: string;
}

interface Props {
  homeTeam:   Team | null;
  partnerTeam: Team | null;
  homeRoster:    Asset[];
  partnerRoster: Asset[];
  outgoing: Asset[];  // home gives away
  incoming: Asset[];  // home receives
}

const CAP_CEILING = 95.5; // 2025-26

const posOrder = ["C", "W", "L", "R", "D", "G"];
const posLabel: Record<string, string> = {
  C: "Centres", W: "Wingers", L: "Wingers", R: "Wingers",
  D: "Defence", G: "Goalies",
};

const RosterSlot = ({ player, isNew, isLeaving }: {
  player: Asset;
  isNew?: boolean;
  isLeaving?: boolean;
}) => (
  <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all ${
    isNew     ? "bg-emerald-950/40 border border-emerald-900/50" :
    isLeaving ? "bg-rose-950/40 border border-rose-900/40 opacity-50" :
    "bg-zinc-900/40 border border-zinc-800/30"
  }`}>
    {player.headshot && (
      <img src={player.headshot} alt={player.name}
        className="w-5 h-5 rounded-full object-cover border border-zinc-700/50 shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
    )}
    <div className="flex-1 min-w-0">
      <div className={`text-[10px] font-black truncate ${isLeaving ? "line-through text-zinc-600" : isNew ? "text-emerald-300" : "text-zinc-300"}`}>
        {player.name}
      </div>
      <div className="text-[8px] text-zinc-700 font-bold">
        ${player.capHit.toFixed(1)}M · {player.yearsRemaining}yr
      </div>
    </div>
    <div className={`text-[9px] font-black font-mono ${isNew ? "text-emerald-400" : isLeaving ? "text-rose-500" : "text-zinc-600"}`}>
      {player.ptsPace > 0 ? `${player.ptsPace.toFixed(0)}pts` : ""}
    </div>
  </div>
);

const TeamProjection = ({ team, currentRoster, outgoing, incoming, label }: {
  team: Team;
  currentRoster: Asset[];
  outgoing: Asset[];
  incoming: Asset[];
  label: string;
}) => {
  const outIds = new Set(outgoing.map(a => a.id));
  const inIds  = new Set(incoming.map(a => a.id));

  // Build post-trade roster
  const postRoster = [
    ...currentRoster.filter(a => !outIds.has(a.id)),
    ...incoming.filter(a => a.position !== "Pick"),
  ];

  const currentCapUsed = currentRoster.reduce((s, a) => s + (a.capHit || 0), 0);
  const outCap  = outgoing.reduce((s, a) => s + (a.capHit || 0), 0);
  const inCap   = incoming.filter(a => a.position !== "Pick").reduce((s, a) => s + (a.capHit || 0), 0);
  const postCapUsed = currentCapUsed - outCap + inCap;
  const postCapSpace = CAP_CEILING - postCapUsed;

  // Group by normalised position
  const groupByPos = (roster: Asset[]) => {
    const groups: Record<string, Asset[]> = {};
    roster.filter(a => a.position !== "Pick").forEach(a => {
      const pos = a.position === "L" || a.position === "R" ? "W" : a.position;
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(a);
    });
    return groups;
  };

  const postGroups = groupByPos(postRoster);

  return (
    <div className="flex-1 min-w-0">
      {/* Team header */}
      <div className="mb-3">
        <div className="font-black text-white text-sm">{team.name}</div>
        <div className="text-[9px] text-zinc-600 font-black uppercase tracking-wider">{label}</div>
      </div>

      {/* Cap bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[8px] font-black uppercase tracking-wider text-zinc-700">Cap After Trade</span>
          <span className={`text-[10px] font-black font-mono ${postCapSpace >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {postCapSpace >= 0 ? `+$${postCapSpace.toFixed(1)}M` : `-$${Math.abs(postCapSpace).toFixed(1)}M over`}
          </span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${postCapSpace < 0 ? "bg-rose-500" : postCapSpace < 5 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, (postCapUsed / CAP_CEILING) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[8px] text-zinc-700 font-mono mt-0.5">
          <span>${postCapUsed.toFixed(1)}M used</span>
          <span>${CAP_CEILING}M ceiling</span>
        </div>
      </div>

      {/* Roster by position */}
      <div className="space-y-3">
        {["C", "W", "D", "G"].map(pos => {
          const players = postGroups[pos] ?? [];
          if (!players.length) return null;
          return (
            <div key={pos}>
              <div className="text-[8px] font-black uppercase tracking-widest text-zinc-700 mb-1.5">
                {posLabel[pos]} ({players.length})
              </div>
              <div className="space-y-1">
                {players
                  .sort((a, b) => (b.avgTOI || 0) - (a.avgTOI || 0))
                  .map(p => (
                    <RosterSlot
                      key={p.id}
                      player={p}
                      isNew={inIds.has(p.id)}
                      isLeaving={false}
                    />
                  ))}
                {/* Show departing players as struck through */}
                {outgoing
                  .filter(a => (a.position === "L" || a.position === "R" ? "W" : a.position) === pos)
                  .map(p => (
                    <RosterSlot key={p.id} player={p} isLeaving={true} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function CapProjection({ homeTeam, partnerTeam, homeRoster, partnerRoster, outgoing, incoming }: Props) {
  if (!homeTeam || !partnerTeam) return null;
  if (!outgoing.length && !incoming.length) return null;

  return (
    <div className="mt-4 bg-zinc-900/30 border border-zinc-800/40 rounded-2xl overflow-hidden">
      <div className="px-6 py-3 border-b border-zinc-800/40 flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600">Post-Trade Roster Projection</span>
        <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-wider text-zinc-700">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-900/60 border border-rose-800/60 inline-block" />Departing</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-900/60 border border-emerald-800/60 inline-block" />Arriving</span>
        </div>
      </div>

      <div className="p-5 flex gap-6">
        <TeamProjection
          team={homeTeam}
          currentRoster={homeRoster}
          outgoing={outgoing}
          incoming={incoming.filter(a => a.position !== "Pick")}
          label="Your franchise after trade"
        />
        <div className="w-px bg-zinc-800/50 self-stretch" />
        <TeamProjection
          team={partnerTeam}
          currentRoster={partnerRoster}
          outgoing={incoming.filter(a => a.position !== "Pick")}
          incoming={outgoing}
          label="Partner franchise after trade"
        />
      </div>
    </div>
  );
}