// ── Dedicated player page — /players/{nhlPlayerId} ───────────────
// SERVER component: all valuation math (X-NAV, gravity) runs here and
// only computed numbers cross to the client. GravityField receives a
// serialized profile as props — the formula never ships in this page's
// bundle. The playerId segment is the NHL player id, matching the NHL
// API, so external links can be constructed from any NHL data source.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { calcNAV } from "@/app/lib/xnav-engine";
import { computeGravity } from "@/app/lib/gravity";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import GravityField from "@/app/components/GravityField";
import PlayerStrandPanel from "@/app/components/PlayerStrandPanel";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";

export const dynamic = "force-dynamic";

async function loadPlayer(playerId: string) {
  const roster = await assembleCanonicalRoster();
  const player = (roster.players as any[]).find(p => String(p.id) === playerId);
  return player ?? null;
}

export async function generateMetadata(
  { params }: { params: { playerId: string } },
): Promise<Metadata> {
  const player = await loadPlayer(params.playerId);
  if (!player) return { title: "Player not found — The Hockey Ledger" };
  return {
    title: `${player.name} — The Hockey Ledger`,
    description: `${player.name}: X-NAV valuation, gravity field analysis, contract and market value.`,
  };
}

const ink = "var(--ledger-ink)";
const faint = "var(--ledger-ink-faint)";
const rule = "var(--ledger-rule)";

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center px-2 py-2">
      <div className="text-[9px] font-black uppercase tracking-[0.12em] font-mono" style={{ color: faint }}>
        {label}
      </div>
      <div className="text-[15px] font-black font-mono" style={{ color: color ?? ink, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

export default async function PlayerPage({ params }: { params: { playerId: string } }) {
  const player = await loadPlayer(params.playerId);
  if (!player || player.position === "Pick") notFound();

  const teamName = TEAMS_DB.find(t => t.id === player.teamId)?.name ?? player.teamId;
  const position = player.position === "D" || player.position === "G" || player.position === "C"
    ? player.position : "W";

  // Server-side valuation — numbers only from here down.
  const xnav = calcNAV({
    ...player,
    position,
    capCeiling: SEASON.capCeiling,
    defRate: player.defRate ?? 0.08,
    games: player.games ?? 40,
  });
  const gravity = player.position !== "G" ? computeGravity(player) : null;

  const games = player.games ?? 0;
  const goals = player.goalsPace != null ? Math.round((player.goalsPace / 82) * games) : null;
  const assists = player.assistsPace != null ? Math.round((player.assistsPace / 82) * games) : null;
  const pts = player.ptsPace != null ? Math.round((player.ptsPace / 82) * games) : null;
  const pm = player.plusMinus;

  const navComponents = [
    { label: "OFF", val: xnav.off },
    { label: "DEF", val: xnav.def },
    { label: "GRAV", val: xnav.grav ?? 0 },
    { label: "AGE", val: xnav.age },
    { label: "CAP", val: xnav.cap },
    { label: "UPS", val: xnav.upside },
  ];
  const surplus = xnav.fmvAav != null ? xnav.fmvAav - player.capHit : null;

  return (
    <main className="min-h-screen px-4 py-6" style={{ background: "var(--paper-bg)", color: ink }}>
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <Header activeTab="players" />

        {/* Dossier strip */}
        <div className="flex items-center justify-between border-b-2 pb-2 mb-4 mt-4" style={{ borderColor: ink }}>
          <Link href="/players" className="text-[10px] font-black font-mono uppercase tracking-[0.2em]" style={{ color: faint }}>
            ← All Players
          </Link>
          <span className="text-[9px] font-mono uppercase tracking-[0.2em]" style={{ color: faint }}>
            Player Dossier
          </span>
        </div>

        {/* Identity header */}
        <div className="flex items-center gap-4 border p-4 mb-3" style={{ borderColor: ink, background: "var(--paper-card, var(--paper-inset))" }}>
          {player.headshot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.headshot}
              alt=""
              className="rounded-full object-cover shrink-0"
              style={{ width: 64, height: 64, border: `2px solid ${ink}` }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] font-black font-mono leading-tight truncate">{player.name}</h1>
            <div className="text-[11px] font-black font-mono uppercase tracking-[0.12em] mt-0.5" style={{ color: faint }}>
              {teamName} · {player.position} · Age {player.age}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[32px] font-black font-mono leading-none">{xnav.total}</div>
            <div className="text-[9px] font-black font-mono uppercase tracking-[0.18em]" style={{ color: faint }}>X-NAV</div>
          </div>
        </div>

        {/* Season stats */}
        <div className="grid grid-cols-6 border mb-3" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
          <StatCell label="GP" value={String(games)} />
          <StatCell label="G" value={goals != null ? String(goals) : "—"} />
          <StatCell label="A" value={assists != null ? String(assists) : "—"} />
          <StatCell label="PTS" value={pts != null ? String(pts) : "—"} />
          <StatCell
            label="+/−"
            value={pm != null ? `${pm > 0 ? "+" : ""}${pm}` : "—"}
            color={pm != null ? (pm > 0 ? "var(--ledger-green)" : pm < 0 ? "var(--ledger-red)" : undefined) : undefined}
          />
          <StatCell label="TOI" value={player.avgTOI != null ? player.avgTOI.toFixed(1) : "—"} />
        </div>

        {/* NAV components */}
        <div className="border mb-3" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
          <div className="px-3 pt-2 text-[9px] font-black font-mono uppercase tracking-[0.18em]" style={{ color: faint }}>
            Value Breakdown
          </div>
          <div className="grid grid-cols-6">
            {navComponents.map(c => (
              <StatCell
                key={c.label}
                label={c.label}
                value={`${c.val > 0 ? "+" : ""}${c.val}`}
                color={c.val > 0 ? "var(--ledger-green)" : c.val < 0 ? "var(--ledger-red)" : undefined}
              />
            ))}
          </div>
        </div>

        {/* Contract + market */}
        <div className="flex flex-wrap items-center justify-between gap-3 border px-4 py-3 mb-4" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
          <div>
            <div className="text-[9px] font-black font-mono uppercase tracking-[0.14em]" style={{ color: faint }}>Contract</div>
            <div className="text-[13px] font-black font-mono">
              ${player.capHit.toFixed(1)}M × {player.yearsRemaining}yr
            </div>
          </div>
          {xnav.fmvAav != null && (
            <div>
              <div className="text-[9px] font-black font-mono uppercase tracking-[0.14em]" style={{ color: faint }}>Market AAV</div>
              <div className="text-[13px] font-black font-mono">${xnav.fmvAav.toFixed(1)}M</div>
            </div>
          )}
          {surplus != null && (
            <div className="text-right">
              <div className="text-[9px] font-black font-mono uppercase tracking-[0.14em]" style={{ color: faint }}>Surplus</div>
              <div className="text-[13px] font-black font-mono" style={{ color: surplus > 0 ? "var(--ledger-green)" : "var(--ledger-red)" }}>
                {surplus > 0 ? "+" : ""}${surplus.toFixed(1)}M
              </div>
            </div>
          )}
        </div>

        {/* STRAND DNA — stylistic identity profile */}
        <div className="border p-4 mb-4" style={{ borderColor: rule, background: "var(--paper-card, var(--paper-inset))" }}>
          <div className="text-[9px] font-black font-mono uppercase tracking-[0.18em] mb-3" style={{ color: faint }}>
            STRAND DNA
          </div>
          <div className="flex justify-center">
            <PlayerStrandPanel player={player} />
          </div>
        </div>

        {/* Gravity field — computed server-side, rendered client-side from props */}
        {gravity && (
          <div className="border p-4" style={{ borderColor: rule, background: "var(--paper-card, var(--paper-inset))" }}>
            <GravityField profile={gravity} playerName={player.name} mode="full" />
          </div>
        )}

        <div className="mt-4 pt-2 border-t text-center" style={{ borderColor: rule }}>
          <Link href="/players" className="text-[10px] font-black font-mono uppercase tracking-[0.16em]" style={{ color: faint }}>
            Full League Analytics →
          </Link>
        </div>

        <Footer />
      </div>
    </main>
  );
}
