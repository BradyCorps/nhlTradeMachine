"use client";

import { compressPackage } from "@/app/lib/xnav-engine";
import { formatPickRound } from "@/app/lib/trade-format";
import { PlayerAvatar } from "@/app/components/PlayerAvatar";
import { displayPosition } from "@/app/lib/display-position";
import { compareStat } from "@/app/lib/stat-bar-compare";

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
  xGPace?: number;
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
  homeVal: number | null;      // null = this side has no comparable data (e.g. picks only)
  partnerVal: number | null;
  higherIsBetter?: boolean;
  unit?: string;
}) => {
  const { homeWins, partWins, homePct, partPct } = compareStat(homeVal, partnerVal, higherIsBetter);

  const fmt = (v: number | null) => {
    if (v == null) return "—";
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
              className={`h-full rounded-full transition-all ${partWins ? "bg-cyan-500" : "bg-zinc-600"}`}
              style={{ width: `${partPct}%` }}
            />
          </div>
          <span className={`text-[10px] font-black font-mono tabular-nums ${partWins ? "text-cyan-400" : "text-zinc-500"}`}>
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
        {!isPick && <PlayerAvatar name={asset.name} position={asset.position} size={28}
          playerId={asset.id} teamId={asset.teamId} headshot={asset.headshot} />}
        <div className="min-w-0 flex-1">
          <div className="font-black text-white text-[12px] truncate">{asset.name}</div>
          <div className="text-[9px] text-zinc-600 font-bold">
            {isPick
              ? `${asset.year} ${formatPickRound(asset.round)} Round Pick`
              : (() => {
                  const effective = asset.capHit * (1 - (asset.retainedPct || 0));
                  const hasRetention = (asset.retainedPct || 0) > 0;
                  return hasRetention
                    ? `${displayPosition(asset.position, asset.secondaryPosition)} · Age ${asset.age} · $${effective.toFixed(1)}M × ${asset.yearsRemaining}yr (${Math.round(asset.retainedPct! * 100)}% retained)`
                    : `${displayPosition(asset.position, asset.secondaryPosition)} · Age ${asset.age} · $${asset.capHit.toFixed(1)}M × ${asset.yearsRemaining}yr`;
                })()}
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
            { label: "xG/82",  val: (asset.xGPace ?? 0).toFixed(1)  },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[11px] font-black text-zinc-300">{s.val}</div>
              <div className="text-[11px] font-black uppercase tracking-wide text-zinc-700">{s.label}</div>
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
    assets.filter(a => a.position !== "Pick" && a.position !== "G")
      .reduce((s, a) => s + (typeof a[key] === "number" ? (a[key] as number) : 0), 0);

  // CXH7 — the comparison quoted a LINEAR package sum while the verdict, the
  // TugBar and the audit all quote the compressed value. Two players at 100
  // are not worth 200 to a club with one roster slot, and this panel sits
  // directly beside the number that says so.
  const navSum = (assets: Asset[]) =>
    compressPackage(assets.map(a => ({
      nav: navMap[a.id]?.total ?? 0,
      isPick: a.position === "Pick",
      age: a.age ?? 27,
    })));

  // Per-skater average for deployment/profile stats (TOI, age). Returns null
  // for a side with no skaters so an empty package reads as "—", not a 0 that
  // would falsely win the youngest/most-rested comparison.
  const avg = (assets: Asset[], key: keyof Asset): number | null => {
    // Goalies excluded from skater rates: a goaltender's ptsPace and xGPace are
    // structurally near zero and his TOI is a different quantity entirely, so
    // including him drags a package's per-skater averages toward nothing and
    // makes any trade involving a goalie read as a downgrade. Age is the one
    // exception a reader might expect — but splitting the rule per metric is
    // how a panel starts disagreeing with itself, so goalies are out of the
    // skater block and their own metrics are shown separately.
    const skaters = assets.filter(a => a.position !== "Pick" && a.position !== "G");
    if (skaters.length === 0) return null;
    const total = skaters.reduce((s, a) => s + (typeof a[key] === "number" ? (a[key] as number) : 0), 0);
    return total / skaters.length;
  };

  const outNav  = navSum(outgoing);
  const inNav   = navSum(incoming);
  const outPts  = sum(outgoing, "ptsPace");
  const inPts   = sum(incoming, "ptsPace");
  const outTOI  = avg(outgoing, "avgTOI");   // averaged per skater, not summed
  const inTOI   = avg(incoming, "avgTOI");
  const outxG   = sum(outgoing, "xGPace") || 0;
  const inxG    = sum(incoming, "xGPace") || 0;
  const outAge  = avg(outgoing, "age");
  const inAge   = avg(incoming, "age");
  // Use effective cap hit (post-retention) so totals match what each team actually pays
  const outCap  = outgoing.reduce((s, a) => s + (a.capHit || 0) * (1 - (a.retainedPct || 0)), 0);
  const inCap   = incoming.reduce((s, a) => s + (a.capHit || 0) * (1 - (a.retainedPct || 0)), 0);

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
            <div className="text-[11px] font-black uppercase tracking-widest text-rose-600 mb-2">You Give Away</div>
            {outgoing.map(a => (
              <PlayerCard key={a.id} asset={a} nav={navMap[a.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 }} side="out" />
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-[11px] font-black uppercase tracking-widest text-cyan-600 mb-2">You Receive</div>
            {incoming.map(a => (
              <PlayerCard key={a.id} asset={a} nav={navMap[a.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 }} side="in" />
            ))}
          </div>
        </div>

        {/* Head-to-head comparison bars */}
        {(hasSkaters(outgoing) || hasSkaters(incoming)) && (
          <div className="border-t border-zinc-800/40 pt-4">
            <div className="text-[11px] font-black uppercase tracking-widest text-zinc-700 mb-3">Head-to-Head</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 items-center mb-1">
              <div className="text-[11px] font-black text-rose-500 text-right w-20">OUTGOING</div>
              <div className="text-[11px] font-black text-cyan-500">INCOMING</div>
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
