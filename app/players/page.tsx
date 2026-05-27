"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────
interface Player {
  id: string;
  name: string;
  teamId: string;
  position: string;
  age: number;
  headshot?: string | null;
  ptsPace: number;
  xGPace: number;
  avgTOI: number;
  qocRank: number;
  games?: number;
  gsax?: number;
  savePct?: number;
  gamesStarted?: number;
  ops?: number | null;
  dps?: number | null;
  xgRelTM?: number | null;
  xgaRelTM?: number | null;
  dzPct?: number | null;
  capHit: number;
  yearsRemaining: number;
  hasNMC?: boolean;
  hasNTC?: boolean;
  hasLiveStats?: boolean;
}

interface Team {
  id: string;
  name: string;
  phase: string;
  standing: number;
}

// ── Goalie tier classification ────────────────────────────────
const goalieTeir = (gp: number): "STARTER" | "TANDEM" | "BACKUP" => {
  if (gp >= 40) return "STARTER";
  if (gp >= 25) return "TANDEM";
  return "BACKUP";
};

// ── Mini helix SVG ────────────────────────────────────────────
function MiniHelix({ ops, dps, ptsPace, avgTOI }: {
  ops?: number | null; dps?: number | null;
  ptsPace: number; avgTOI: number;
}) {
  const W = 80; const H = 28; const cy = H / 2;
  const offV = ops != null && dps != null && (ops + dps) > 0
    ? ops / (ops + dps)
    : Math.min(1, ptsPace / 100);
  const defV = 1 - offV;
  const amp  = 9;
  const freq = (2 * Math.PI) / W;

  const buildPath = (v: number, flip: boolean) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const x = (i / 40) * W;
      const y = cy + (flip ? 1 : -1) * (amp * (0.3 + v * 0.7)) * Math.sin(freq * x * 2);
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <path d={buildPath(defV, true)}  fill="none" stroke="var(--red)"  strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
      <path d={buildPath(offV, false)} fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
    </svg>
  );
}

// ── Archetype badge ───────────────────────────────────────────
function ArchetypeBadge({ player }: { player: Player }) {
  const ops = player.ops ?? null;
  const dps = player.dps ?? null;
  const psTotal = ops !== null && dps !== null ? ops + dps : null;
  const psRatio = psTotal !== null && psTotal > 1 ? ops! / psTotal : null;

  let label = "";
  let color = "var(--ink-faint)";

  if (player.position === "G") {
    const tier = goalieTeir(player.gamesStarted ?? 0);
    label = tier;
    color = tier === "STARTER" ? "var(--green)" : tier === "TANDEM" ? "var(--blue)" : "var(--ink-faint)";
  } else if (player.position === "D") {
    if (psRatio !== null) {
      if (psRatio > 0.62)       { label = "OFF D";    color = "var(--blue)"; }
      else if (psRatio < 0.35)  { label = "SHUTDOWN"; color = "var(--red)"; }
      else                      { label = "TWO-WAY";  color = "var(--green)"; }
    } else {
      if (player.ptsPace >= 45)      { label = "OFF D";    color = "var(--blue)"; }
      else if (player.avgTOI >= 22)  { label = "TWO-WAY";  color = "var(--green)"; }
      else                           { label = "DEPTH D";  color = "var(--ink-faint)"; }
    }
  } else {
    if (psRatio !== null) {
      if (psRatio > 0.65)      { label = "SCORER";   color = "var(--blue)"; }
      else if (psRatio < 0.35) { label = "CHECKER";  color = "var(--red)"; }
      else                     { label = "TWO-WAY";  color = "var(--green)"; }
    } else {
      if (player.ptsPace >= 70)      { label = "SCORER";  color = "var(--blue)"; }
      else if (player.avgTOI >= 16)  { label = "TWO-WAY"; color = "var(--green)"; }
      else                           { label = "DEPTH";   color = "var(--ink-faint)"; }
    }
  }

  if (!label) return null;
  return (
    <span style={{
      fontFamily: "'Courier Prime', monospace",
      fontSize: "6.5px", fontWeight: 900,
      color, border: `1px solid ${color}`,
      padding: "1px 4px", letterSpacing: "0.1em",
      opacity: 0.9, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

// ── Expanded player row ───────────────────────────────────────
function ExpandedPlayer({ player, team }: { player: Player; team?: Team }) {
  const isG = player.position === "G";
  const stats = isG ? [
    { label: "GP",    val: player.gamesStarted?.toString() ?? "—" },
    { label: "GSAx",  val: (player.gsax ?? 0).toFixed(1) },
    { label: "SV%",   val: player.savePct?.toFixed(3) ?? "—" },
    { label: "Tier",  val: goalieTeir(player.gamesStarted ?? 0) },
  ] : [
    { label: "PTS/82", val: player.ptsPace.toFixed(1) },
    { label: "xG/82",  val: player.xGPace.toFixed(1) },
    { label: "TOI",    val: player.avgTOI.toFixed(1) },
    { label: "QoC",    val: player.qocRank.toFixed(0) },
    { label: "xG%+",   val: player.xgRelTM != null ? `${(player.xgRelTM as number) > 0 ? "+" : ""}${(player.xgRelTM as number).toFixed(1)}` : "—" },
    { label: "DZ%",    val: player.dzPct != null ? `${((player.dzPct as number) * 100).toFixed(0)}%` : "—" },
  ];

  return (
    <div style={{
      background: "#d6c8a5", borderTop: "1px solid #b8a070",
      padding: "12px 16px",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Left — stats */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginBottom: "10px" }}>
            {stats.map(s => (
              <div key={s.label} style={{
                background: "#e4d8b8", border: "1px solid #b8a070",
                padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "7px", color: "#9a7d58", textTransform: "uppercase", letterSpacing: "0.1em" }}>{s.label}</div>
                <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "11px", fontWeight: 900, color: "#1c140a", marginTop: "2px" }}>{s.val}</div>
              </div>
            ))}
          </div>
          {!isG && (player.ops != null || player.dps != null) && (
            <div style={{ display: "flex", gap: "6px" }}>
              {player.ops != null && (
                <div style={{ padding: "3px 8px", background: "var(--blue-dim)", border: "1px solid rgba(43,63,102,0.3)", fontFamily: "'Courier Prime', monospace", fontSize: "8px", fontWeight: 900 }}>
                  <span style={{ color: "var(--rule)", marginRight: "4px" }}>OPS</span>
                  <span style={{ color: "var(--blue)" }}>{player.ops.toFixed(1)}</span>
                </div>
              )}
              {player.dps != null && (
                <div style={{ padding: "3px 8px", background: "var(--red-dim)", border: "1px solid rgba(166,53,36,0.3)", fontFamily: "'Courier Prime', monospace", fontSize: "8px", fontWeight: 900 }}>
                  <span style={{ color: "var(--rule)", marginRight: "4px" }}>DPS</span>
                  <span style={{ color: "var(--red)" }}>{player.dps.toFixed(1)}</span>
                </div>
              )}
              {player.ops != null && player.dps != null && (
                <div style={{ padding: "3px 8px", background: "var(--paper-card)", border: "1px solid var(--rule-light)", fontFamily: "'Courier Prime', monospace", fontSize: "8px", fontWeight: 900 }}>
                  <span style={{ color: "var(--rule)", marginRight: "4px" }}>PS</span>
                  <span style={{ color: "var(--ink)" }}>{(player.ops + player.dps).toFixed(1)}</span>
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: "10px", fontFamily: "'Courier Prime', monospace", fontSize: "8px", color: "var(--ink-faint)" }}>
            <span style={{ color: "var(--rule)", marginRight: "6px" }}>CONTRACT</span>
            ${player.capHit}M × {player.yearsRemaining}yr
            {player.hasNMC && <span style={{ marginLeft: "8px", color: "var(--red)", border: "1px solid var(--red)", padding: "0 3px" }}>NMC</span>}
            {player.hasNTC && !player.hasNMC && <span style={{ marginLeft: "8px", color: "#8a5c00", border: "1px solid #8a5c00", padding: "0 3px" }}>NTC</span>}
          </div>
        </div>

        {/* Right — helix */}
        {!isG && (
          <div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "7px", color: "#9a7d58", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "6px" }}>
              STRAND™ Profile
            </div>
            <div style={{ background: "#e4d8b8", border: "1px solid #b8a070", padding: "8px", position: "relative" }}>
              {/* Full STRAND inline */}
              <FullStrand player={player} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline full strand ────────────────────────────────────────
function FullStrand({ player }: { player: Player }) {
  const W = 280; const H = 135; const cy = H / 2;
  const amp = 34; const freq = (2 * Math.PI) / W;
  const offColor = "var(--blue)"; const defColor = "var(--red)";

  const ops = player.ops ?? null;
  const dps = player.dps ?? null;
  const psTotal = ops !== null && dps !== null ? ops + dps : null;
  const opsNorm = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, ops! / psTotal)) : null;
  const dpsNorm = psTotal !== null && psTotal > 0 ? Math.max(0, Math.min(1, dps! / psTotal)) : null;

  const isD = player.position === "D";
  const norm = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

  const offTraits = [
    { label: ops !== null ? "OPS" : "SCR",  val: opsNorm ?? norm(player.ptsPace, 0, isD ? 80 : 100), ps: ops?.toFixed(1) },
    { label: "xG",   val: norm(player.xGPace ?? 0, 0, isD ? 25 : 50) },
    { label: "NOIV", val: norm(player.xgRelTM ?? 0, -12, 12) },
    { label: "TOI+", val: norm(player.avgTOI, 10, 27) },
  ];
  const defTraits = [
    { label: dps !== null ? "DPS" : "DEF",  val: dpsNorm ?? 0.5, ps: dps?.toFixed(1) },
    { label: "QoC",  val: norm(400 - (player.qocRank ?? 400), 50, 380) },
    { label: "DZ%",  val: 1 - norm(player.dzPct ?? 0.5, 0.3, 0.7) },
    { label: "SUPP", val: norm(-(player.xgaRelTM ?? 0), -1.5, 1.5) },
  ];

  // Build a sine wave that passes EXACTLY through each trait node.
  // At each node's x position the amplitude = that trait's val.
  // Between nodes we interpolate amplitude smoothly (cubic ease).
  const buildPath = (traits: typeof offTraits, flip: boolean) => {
    const n = traits.length;
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const x = (i / 80) * W;
      // Which segment are we in? Each trait occupies 1/n of the width, centered.
      const normX = x / W * n - 0.5; // 0 = first node, n-1 = last node
      const lo    = Math.max(0, Math.floor(normX));
      const hi    = Math.min(n - 1, lo + 1);
      const t2    = Math.max(0, Math.min(1, normX - lo));
      // Smooth step interpolation
      const smooth = t2 * t2 * (3 - 2 * t2);
      const interpVal = traits[lo].val * (1 - smooth) + traits[hi].val * smooth;
      const y = cy + (flip ? 1 : -1) * (amp * (0.3 + interpVal * 0.7)) * Math.sin(freq * x * 2);
      pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <path d={buildPath(defTraits, true)}  fill="none" stroke={defColor} strokeWidth="2" strokeLinecap="round" opacity="0.85"/>
      <path d={buildPath(offTraits, false)} fill="none" stroke={offColor} strokeWidth="2" strokeLinecap="round" opacity="0.85"/>
      {offTraits.map((t, i) => {
        const x    = ((i + 0.5) / offTraits.length) * W;
        // Node is at the sine peak for this trait — sin=1 at peak
        // At node x, normX = i (exactly), so interpVal = t.val exactly
        const y    = cy - (amp * (0.3 + t.val * 0.7)) * Math.sin(freq * x * 2);
        const labelY = Math.min(y - 14, cy - 13);
        return (
          <g key={t.label}>
            <circle cx={x} cy={y} r={t.ps ? 3.5 : 2.5} fill={offColor}/>
            <text x={x} y={labelY}     textAnchor="middle" fontSize="7" fill={offColor} fontFamily="Courier Prime, monospace" fontWeight="bold">{t.label}</text>
            <text x={x} y={labelY + 8} textAnchor="middle" fontSize="6" fill={offColor} fontFamily="Courier Prime, monospace" opacity="0.85">
              {t.ps ?? Math.round(t.val * 100)}
            </text>
          </g>
        );
      })}
      {defTraits.map((t, i) => {
        const x    = ((i + 0.5) / defTraits.length) * W;
        const y    = cy + (amp * (0.3 + t.val * 0.7)) * Math.sin(freq * x * 2);
        const labelY = Math.max(y + 17, cy + 9);
        return (
          <g key={t.label}>
            <circle cx={x} cy={y} r={t.ps ? 3.5 : 2.5} fill={defColor}/>
            <text x={x} y={labelY}     textAnchor="middle" fontSize="7" fill={defColor} fontFamily="Courier Prime, monospace" fontWeight="bold">{t.label}</text>
            <text x={x} y={labelY + 8} textAnchor="middle" fontSize="6" fill={defColor} fontFamily="Courier Prime, monospace" opacity="0.85">
              {t.ps ?? Math.round(t.val * 100)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Player row ────────────────────────────────────────────────
function PlayerRow({ player, team, rank, sortKey, actualPPG }: {
  player: Player; team?: Team; rank: number;
  sortKey: string;
  actualPPG: (p: Player) => number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isG = player.position === "G";

  const primaryStat = isG
    ? `${(player.gsax ?? 0).toFixed(1)} GSAx`
    : sortKey === "ppg"   ? `${actualPPG(player).toFixed(3)} PPG`
    : sortKey === "pts"   ? `${player.ptsPace.toFixed(1)} P/82`
    : sortKey === "ops"   ? `${player.ops != null ? player.ops.toFixed(1) : "—"} OPS`
    : sortKey === "dps"   ? `${player.dps != null ? player.dps.toFixed(1) : "—"} DPS`
    : sortKey === "toi"   ? `${player.avgTOI.toFixed(1)} TOI`
    : sortKey === "age"   ? `${player.age} Age`
    : sortKey === "cap"   ? `$${player.capHit}M Cap`
    : `${actualPPG(player).toFixed(3)} PPG`;

  const secondaryStat = isG
    ? `${player.savePct?.toFixed(3) ?? "—"} SV%`
    : sortKey === "dps"   ? `${player.ptsPace.toFixed(1)} P/82`
    : sortKey === "ops"   ? `${player.ptsPace.toFixed(1)} P/82`
    : sortKey === "toi"   ? `${actualPPG(player).toFixed(3)} PPG`
    : sortKey === "age"   ? `${player.capHit}M Cap`
    : sortKey === "cap"   ? `${player.yearsRemaining}yr Left`
    : `${player.avgTOI.toFixed(1)} TOI`;

  return (
    <>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "grid",
          gridTemplateColumns: "32px 36px 1fr 80px 72px 64px",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderBottom: "1px solid var(--rule-light)",
          cursor: "pointer",
          background: expanded ? "var(--paper-card)" : "transparent",
          transition: "background 0.15s",
        }}
        className="player-row"
      >
        {/* Rank */}
        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9px", color: "var(--rule)", textAlign: "right" }}>
          {rank}
        </div>

        {/* Headshot */}
        <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: "var(--paper-dark)", flexShrink: 0 }}>
          {player.headshot
            ? <img src={player.headshot} alt={player.name} width={32} height={32} style={{ objectFit: "cover" }}/>
            : <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Courier Prime', monospace", fontSize: "9px", color: "var(--rule)" }}>
                {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
          }
        </div>

        {/* Name + team + badges */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: "12px", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {player.name}
            </span>
            <ArchetypeBadge player={player} />
            {player.hasNMC && <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "6px", color: "var(--red)", border: "1px solid var(--red)", padding: "0 3px" }}>NMC</span>}
          </div>
          <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8px", color: "var(--rule)", marginTop: "1px" }}>
            {team?.name ?? player.teamId} · {player.position} · Age {player.age}
          </div>
        </div>

        {/* Mini helix — hidden on mobile */}
        <div className="players-hide-mobile">
          {!isG
            ? <MiniHelix ops={player.ops} dps={player.dps} ptsPace={player.ptsPace} avgTOI={player.avgTOI}/>
            : <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8px", color: "var(--ink-faint)", textAlign: "center" }}>
                {goalieTeir(player.gamesStarted ?? 0)}
              </div>
          }
        </div>

        {/* Primary stat */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "11px", fontWeight: 900, color: "var(--ink)" }}>
            {primaryStat.split(" ")[0]}
          </div>
          <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "7px", color: "var(--rule)", textTransform: "uppercase" }}>
            {primaryStat.split(" ").slice(1).join(" ")}
          </div>
        </div>

        {/* Secondary stat + expand */}
        <div style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
          <div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "10px", color: "var(--ink-light)" }}>
              {secondaryStat.split(" ")[0]}
            </div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "7px", color: "var(--rule)", textTransform: "uppercase" }}>
              {secondaryStat.split(" ").slice(1).join(" ")}
            </div>
          </div>
          <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8px", color: "var(--rule)" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {expanded && <ExpandedPlayer player={player} team={team} />}
    </>
  );
}

// ── Section header ────────────────────────────────────────────
function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      padding: "5px 12px",
      background: "#1c140a",
      borderBottom: "1px solid #b8a070",
      display: "flex", alignItems: "center", gap: "10px",
    }}>
      <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "7px", fontWeight: 900, color: "#e4d8b8", textTransform: "uppercase", letterSpacing: "0.25em" }}>
        {label}
      </span>
      <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "7px", color: "#9a7d58" }}>
        · {count} players
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function PlayersPage() {
  const [players, setPlayers]   = useState<Player[]>([]);
  const [teams, setTeams]       = useState<Team[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [posFilter, setPosFilter] = useState<"ALL" | "F" | "D" | "G">("ALL");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<"ppg" | "pts" | "toi" | "ops" | "dps" | "age" | "cap">("ppg");

  // PPG = actual points per game played (not pace-projected)
  const ppg = (p: Player): number => {
    const gp = p.games ?? 0;
    if (gp < 5) return 0; // ignore tiny sample sizes
    return (p.ptsPace / 82) * gp / gp; // ptsPace = pts/82 * 82 / gp ... simplifies to ptsPace/82
  };

  // Simpler: derive actual points from ptsPace and games
  const actualPPG = (p: Player): number => {
    const gp = p.games ?? 0;
    if (gp < 5) return 0;
    const actualPts = (p.ptsPace / 82) * gp;
    return actualPts / gp;
  };

  useEffect(() => {
    fetch("/api/league")
      .then(r => r.json())
      .then(d => {
        setPlayers((d.players ?? []).filter((p: Player) => p.position !== "Pick"));
        setTeams(d.teams ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const teamMap = useMemo(() => {
    const m = new Map<string, Team>();
    teams.forEach(t => m.set(t.id, t));
    return m;
  }, [teams]);

  const filtered = useMemo(() => {
    let list = players;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.teamId.toLowerCase().includes(q)
      );
    }

    if (posFilter !== "ALL") {
      if (posFilter === "F") list = list.filter(p => ["C","W","L","R"].includes(p.position));
      else list = list.filter(p => p.position === posFilter);
    }

    if (teamFilter !== "ALL") {
      list = list.filter(p => p.teamId === teamFilter);
    }

    return list;
  }, [players, search, posFilter, teamFilter]);

  // Sort and split into sections
  const { skaters, goalies } = useMemo(() => {
    const sk = filtered.filter(p => p.position !== "G");
    const go = filtered.filter(p => p.position === "G");

    const sortFn = (a: Player, b: Player): number => {
      switch (sortKey) {
        case "ppg": return actualPPG(b) - actualPPG(a);
        case "pts": return b.ptsPace - a.ptsPace;
        case "toi": return b.avgTOI - a.avgTOI;
        case "ops": return (b.ops ?? -99) - (a.ops ?? -99);
        case "dps": return (b.dps ?? -99) - (a.dps ?? -99);
        case "age": return a.age - b.age;
        case "cap": return b.capHit - a.capHit;
        default:    return actualPPG(b) - actualPPG(a);
      }
    };

    return {
      skaters: sk.sort(sortFn),
      goalies: go.sort((a, b) => (b.gsax ?? 0) - (a.gsax ?? 0)),
    };
  }, [filtered, sortKey]);

  const starters = goalies.filter(g => goalieTeir(g.gamesStarted ?? 0) === "STARTER");
  const tandems  = goalies.filter(g => goalieTeir(g.gamesStarted ?? 0) === "TANDEM");
  const backups  = goalies.filter(g => goalieTeir(g.gamesStarted ?? 0) === "BACKUP");

  return (
    <main style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)", fontFamily: "'Libre Baskerville', serif" }}>

      {/* Header — newspaper masthead style */}
      <div style={{ borderBottom: '1px solid #b8a070', padding: "16px 20px 12px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ borderTop: '4px double #1c140a', borderBottom: '4px double #1c140a', padding: '8px 0 6px', marginBottom: '12px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8px", color: "#9a7d58", letterSpacing: "0.4em", textTransform: "uppercase", marginBottom: "4px" }}>
              Est. 2025 &nbsp;—&nbsp; Vol. VII &nbsp;—&nbsp; Trade Edition
            </div>
            <a href="/" style={{ textDecoration: "none" }}>
              <h1 style={{ fontFamily: "'Libre Baskerville', Georgia, serif", fontSize: "clamp(1.8rem, 5vw, 3rem)", fontWeight: 900, color: "#1c140a", margin: 0, lineHeight: 1, letterSpacing: "-0.02em", cursor: "pointer", opacity: 1, transition: "opacity 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.7")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}>
                The Hockey Ledger
              </h1>
            </a>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8px", color: "#9a7d58", letterSpacing: "0.3em", textTransform: "uppercase", marginTop: "6px" }}>
              X-NAV Analytics &nbsp;·&nbsp; xG Suppression &nbsp;·&nbsp; GM Logic Engine &nbsp;·&nbsp; Live Statistics
            </div>
            <div style={{ marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
              <a href="/" style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8px", fontWeight: 900, color: "#9a7d58", textDecoration: "none", letterSpacing: "0.2em", textTransform: "uppercase", transition: "color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#1c140a")}
                onMouseLeave={e => (e.currentTarget.style.color = "#9a7d58")}>
                ◇ TRADE MACHINE
              </a>
              <span style={{ color: "#c8b890" }}>|</span>
              <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8px", fontWeight: 900, color: "#1c140a", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                ◆ PLAYER ANALYTICS
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            <span style={{ color: "#b8a070", fontFamily: "'Courier Prime', monospace", fontSize: "8px" }}>
              {players.length > 0 ? `${skaters.length + goalies.length} players · Live data` : "Loading..."}
            </span>
          </div>

          {/* Search + filters */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search player or team..."
              style={{
                fontFamily: "'Courier Prime', monospace", fontSize: "10px",
                padding: "7px 12px", border: "1px solid #b8a070",
                background: "#e4d8b8", color: "#1c140a",
                outline: "none", width: "clamp(160px, 30vw, 220px)",
              }}
            />
            <div style={{ display: "flex", gap: "4px" }}>
              {(["ALL","F","D","G"] as const).map(p => (
                <button key={p} className={`filter-btn${posFilter === p ? " active" : ""}`}
                  onClick={() => setPosFilter(p)}>
                  {p === "ALL" ? "All" : p === "F" ? "Forwards" : p === "D" ? "Defence" : "Goalies"}
                </button>
              ))}
            </div>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              style={{
                fontFamily: "'Courier Prime', monospace", fontSize: "8px",
                padding: "6px 10px", border: "1px solid #b8a070",
                background: "#e4d8b8", color: "#1c140a", cursor: "pointer",
              }}
            >
              <option value="ALL">All Teams</option>
              {teams.sort((a,b) => a.name.localeCompare(b.name)).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 0 40px" }}>
        {loading ? (
          <div style={{ padding: "60px 20px", textAlign: "center", fontFamily: "'Courier Prime', monospace", fontSize: "10px", color: "var(--rule)", letterSpacing: "0.2em" }}>
            LOADING ROSTER DATA...
          </div>
        ) : (
          <>
            {/* Column headers */}
            {(posFilter === "ALL" || posFilter === "F" || posFilter === "D") && skaters.length > 0 && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "32px 36px 1fr 80px 72px 64px",
                gap: "8px",
                padding: "6px 12px",
                borderBottom: "2px solid #1c140a",
                background: "#f2ecd7",
                position: "sticky", top: 0, zIndex: 10,
                borderTop: "1px solid #b8a070",
              }}>
                <div/>
                <div/>
                <div/>
                <div className="players-hide-mobile" style={{ textAlign: "center" }}>
                  <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "7px", color: "var(--rule)", textTransform: "uppercase", letterSpacing: "0.1em" }}>STRAND™</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "4px", flexWrap: "wrap" }}>
                    {(["ppg","pts","ops","dps","toi","age","cap"] as const).map(k => (
                      <button key={k} className={`col-header${sortKey === k ? " active" : ""}`}
                        onClick={() => setSortKey(k)}>
                        {k === "ppg" ? "PPG" : k === "pts" ? "P/82" : k.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div/>
              </div>
            )}

            {/* Skaters */}
            {(posFilter === "ALL" || posFilter === "F" || posFilter === "D") && skaters.length > 0 && (
              <div style={{ border: "1px solid #b8a070", borderTop: "2px solid #1c140a", marginTop: "16px" }}>
                <SectionHeader label="Skaters" count={skaters.length} />
                {skaters.map((p, i) => (
                  <PlayerRow key={p.id} player={p} team={teamMap.get(p.teamId)} rank={i + 1} sortKey={sortKey} actualPPG={actualPPG} />
                ))}
              </div>
            )}

            {/* Goalies */}
            {(posFilter === "ALL" || posFilter === "G") && goalies.length > 0 && (
              <div style={{ border: "1px solid #b8a070", borderTop: "2px solid #1c140a", marginTop: "16px" }}>
                {starters.length > 0 && (
                  <>
                    <SectionHeader label="Starters · 40+ GP" count={starters.length} />
                    {starters.map((p, i) => <PlayerRow key={p.id} player={p} team={teamMap.get(p.teamId)} rank={i + 1} sortKey={sortKey} actualPPG={actualPPG} />)}
                  </>
                )}
                {tandems.length > 0 && (
                  <>
                    <SectionHeader label="Tandems · 25–39 GP" count={tandems.length} />
                    {tandems.map((p, i) => <PlayerRow key={p.id} player={p} team={teamMap.get(p.teamId)} rank={i + 1} sortKey={sortKey} actualPPG={actualPPG} />)}
                  </>
                )}
                {backups.length > 0 && (
                  <>
                    <SectionHeader label="Backups · Under 25 GP" count={backups.length} />
                    {backups.map((p, i) => <PlayerRow key={p.id} player={p} team={teamMap.get(p.teamId)} rank={i + 1} sortKey={sortKey} actualPPG={actualPPG} />)}
                  </>
                )}
              </div>
            )}

            {filtered.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "'Courier Prime', monospace", fontSize: "10px", color: "var(--rule)", letterSpacing: "0.15em" }}>
                NO PLAYERS MATCH YOUR SEARCH
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}