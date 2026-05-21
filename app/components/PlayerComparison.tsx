"use client";

// ============================================================
// PLAYER COMPARISON PANEL
// Side-by-side breakdown of outgoing vs incoming assets.
// Triggered automatically when both blocks have players.
// ============================================================

interface Asset {
  id: string;
  name: string;
  position: string;
  age: number;
  ptsPace: number;
  xGPace: number;
  defRate: number;
  avgTOI: number;
  capHit: number;
  yearsRemaining: number;
  games: number;
  gsax?: number;
  savePct?: number;
  hasLiveStats?: boolean;
  teamId: string;
  headshot?: string;
  [key: string]: any;
}

interface NavBreakdown {
  total: number;
  off: number;
  def: number;
  age: number;
  cap: number;
  upside: number;
}

interface Props {
  outgoing: Asset[];   // home team gives away
  incoming: Asset[];   // home team receives
  navMap: Record<string, NavBreakdown>;
}

const StatBar = ({ label, homeVal, partnerVal, higherIsBetter = true, unit = "" }: {
  label: string;
  homeVal: number;
  partnerVal: number;
  higherIsBetter?: boolean;
  unit?: string;
}) => {
  const max      = Math.max(Math.abs(homeVal), Math.abs(partnerVal), 0.01);
  const homeWins = higherIsBetter ? homeVal >= partnerVal : homeVal <= partnerVal;
  const homePct  = Math.abs(homeVal)   / max * 100;
  const partPct  = Math.abs(partnerVal) / max * 100;

  const fmt = (v: number) => {
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 10)  return v.toFixed(1);
    return v.toFixed(2);
  };

  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[9px] font-black uppercase tracking-wider text-zinc-600">{label}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5 items-center">
        {/* Home bar (left, fills right→left) */}
        <div className="flex items-center justify-end gap-1.5">
          <span className={`text-[10px] font-black font-mono tabular-nums ${homeWins ? "text-emerald-400" : "text-zinc-500"}`}>
            {fmt(homeVal)}{unit}
          </span>
          <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden flex justify-end">
            <div
              className={`h-full rounded-full transition-all ${homeWins ? "bg-emerald-500" : "bg-zinc-600"}`}
              style={{ width: `${homePct}%` }}
            />
          </div>
        </div>

        {/* Center divider */}
        <div className="w-px h-4 bg-zinc-800" />

        {/* Partner bar (right, fills left→right) */}
        <div className="flex items-center gap-1.5">
          <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${!homeWins ? "bg-cyan-500" : "bg-zinc-600"}`}
              style={{ width: `${partPct}%` }}
            />
          </div>
          <span className={`text-[10px] font-black font-mono tabular-nums ${!homeWins ? "text-cyan-400" : "text-zinc-500"}`}>
            {fmt(partnerVal)}{unit}
          </span>
        </div>
      </div>
    </div>
  );
};

const PlayerCard = ({ asset, nav, side }: { asset: Asset; nav: NavBreakdown; side: "out" | "in" }) => {
  const isPick = asset.position === "Pick";
  const accentColor = side === "out" ? "text-rose-400" : "text-cyan-400";
  const borderColor = side === "out" ? "border-rose-900/30" : "border-cyan-900/30";
  const bgColor     = side === "out" ? "bg-rose-950/10"     : "bg-cyan-950/10";

  return (
    <div className={`rounded-xl border p-3 ${bgColor} ${borderColor}`}>
      <div className="flex items-center gap-2 mb-2">
        {asset.headshot && !isPick && (
          <img src={asset.headshot} alt={asset.name}
            className="w-7 h-7 rounded-full object-cover border border-zinc-700/50 shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-black text-white text-[12px] truncate">{asset.name}</div>
          <div className="text-[9px] text-zinc-600 font-bold">
            {isPick
              ? `${asset.year} ${asset.round === 1 ? "1st" : asset.round === 2 ? "2nd" : `${asset.round}th`} Round Pick`
              : `${asset.position} · Age ${asset.age} · $${asset.capHit.toFixed(1)}M × ${asset.yearsRemaining}yr`}
          </div>
        </div>
        <div className={`text-lg font-black font-mono italic ${nav.total > 80 ? "text-emerald-400" : nav.total > 20 ? "text-sky-400" : nav.total > -20 ? "text-zinc-400" : "text-rose-400"}`}>
          {nav.total > 0 ? "+" : ""}{nav.total.toFixed(0)}
        </div>
      </div>
      {!isPick && (
        <div className="grid grid-cols-3 gap-1">
          {[
            { label: "Pts/82", val: asset.ptsPace?.toFixed(0) ?? "—" },
            { label: "TOI",    val: asset.avgTOI?.toFixed(1)  ?? "—" },
            { label: "xG/82",  val: asset.xGPace?.toFixed(1)  ?? "—" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[11px] font-black text-zinc-300">{s.val}</div>
              <div className="text-[8px] font-black uppercase tracking-wide text-zinc-700">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function PlayerComparison({ outgoing, incoming, navMap }: Props) {
  if (!outgoing.length && !incoming.length) return null;

  // Aggregate stats for comparison (sum of all outgoing vs all incoming)
  const sum = (assets: Asset[], key: keyof Asset) =>
    assets.filter(a => a.position !== "Pick")
      .reduce((s, a) => s + (typeof a[key] === "number" ? (a[key] as number) : 0), 0);

  const navSum = (assets: Asset[]) =>
    assets.reduce((s, a) => s + (navMap[a.id]?.total ?? 0), 0);

  const outNav  = navSum(outgoing);
  const inNav   = navSum(incoming);
  const outPts  = sum(outgoing, "ptsPace");
  const inPts   = sum(incoming, "ptsPace");
  const outTOI  = sum(outgoing, "avgTOI");
  const inTOI   = sum(incoming, "avgTOI");
  const outxG   = sum(outgoing, "xGPace");
  const inxG    = sum(incoming, "xGPace");
  const outAge  = outgoing.filter(a => a.position !== "Pick").reduce((s, a, _, arr) => s + a.age / arr.length, 0);
  const inAge   = incoming.filter(a => a.position !== "Pick").reduce((s, a, _, arr) => s + a.age / arr.length, 0);
  const outCap  = outgoing.reduce((s, a) => s + (a.capHit || 0), 0);
  const inCap   = incoming.reduce((s, a) => s + (a.capHit || 0), 0);

  const hasSkaters = (assets: Asset[]) => assets.some(a => a.position !== "Pick" && a.position !== "G");

  return (
    <div className="mt-6 bg-zinc-900/30 border border-zinc-800/40 rounded-2xl overflow-hidden">
      <div className="px-6 py-3 border-b border-zinc-800/40 flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600">Player Comparison</span>
        <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-wider">
          <span className="text-rose-500">Outgoing</span>
          <span className="text-zinc-700">vs</span>
          <span className="text-cyan-500">Incoming</span>
        </div>
      </div>

      <div className="p-5">
        {/* Individual player cards */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="space-y-2">
            <div className="text-[8px] font-black uppercase tracking-widest text-rose-600 mb-2">You Give Away</div>
            {outgoing.map(a => (
              <PlayerCard key={a.id} asset={a} nav={navMap[a.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 }} side="out" />
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-[8px] font-black uppercase tracking-widest text-cyan-600 mb-2">You Receive</div>
            {incoming.map(a => (
              <PlayerCard key={a.id} asset={a} nav={navMap[a.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 }} side="in" />
            ))}
          </div>
        </div>

        {/* Head-to-head comparison bars */}
        {(hasSkaters(outgoing) || hasSkaters(incoming)) && (
          <div className="border-t border-zinc-800/40 pt-4">
            <div className="text-[8px] font-black uppercase tracking-widest text-zinc-700 mb-3">Head-to-Head</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 items-center mb-1">
              <div className="text-[8px] font-black text-rose-500 text-right w-20">OUTGOING</div>
              <div className="text-[8px] font-black text-cyan-500">INCOMING</div>
            </div>
            <StatBar label="Total NAV"   homeVal={outNav}  partnerVal={inNav}  unit="" />
            <StatBar label="Pts/82"      homeVal={outPts}  partnerVal={inPts}  unit="" />
            <StatBar label="Avg TOI"     homeVal={outTOI}  partnerVal={inTOI}  unit="m" />
            <StatBar label="xG/82"       homeVal={outxG}   partnerVal={inxG}   unit="" />
            <StatBar label="Cap Hit"     homeVal={outCap}  partnerVal={inCap}  unit="M" higherIsBetter={false} />
            <StatBar label="Avg Age"     homeVal={outAge}  partnerVal={inAge}  unit=""  higherIsBetter={false} />
          </div>
        )}

        {/* NAV verdict */}
        <div className="border-t border-zinc-800/40 pt-3 mt-3 flex items-center justify-between">
          <div className="text-[10px] font-black text-zinc-600">
            Net NAV for home team
          </div>
          <div className={`text-xl font-black font-mono ${inNav - outNav > 5 ? "text-emerald-400" : inNav - outNav < -5 ? "text-rose-400" : "text-sky-400"}`}>
            {inNav - outNav > 0 ? "+" : ""}{(inNav - outNav).toFixed(0)} NAV
          </div>
        </div>
      </div>
    </div>
  );
}