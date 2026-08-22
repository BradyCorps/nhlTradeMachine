// ── Dedicated player page — /players/{nhlPlayerId} ───────────────
// SERVER component: all valuation math (X-NAV, gravity) runs here and
// only computed numbers cross to the client. GravityField receives a
// serialized profile as props — the formula never ships in this page's
// bundle. The playerId segment is the NHL player id, matching the NHL
// API, so external links can be constructed from any NHL data source.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getCachedRoster } from "@/app/lib/cached-roster";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import { gravityForDisplay } from "@/app/lib/gravity-channels";
import { loadGravityProfileV4 } from "@/app/lib/gravity-v4/load-profile";
import { GRAVITY_V4_RUNTIME_ARTIFACT } from "@/app/lib/gravity-v4/runtime-artifact";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import GravityField from "@/app/components/GravityField";
import GravityFieldV4 from "@/app/components/GravityFieldV4";
import GravityHeatMap from "@/app/components/GravityHeatMap";
import NavTrajectoryChart from "@/app/components/NavTrajectoryChart";
import NavLeagueScatter from "@/app/components/NavLeagueScatter";
import GoalieEdgePanel from "@/app/components/GoalieEdgePanel";
import PlayerStrandPanel from "@/app/components/PlayerStrandPanel";
import EdgeShotMap from "@/app/components/EdgeShotMap";
import { PlayerAvatar } from "@/app/components/PlayerAvatar";
import { navSplit, navSplitNote, navStageDesc, navStageShort, navStagesForDisplay } from "@/app/lib/nav-breakdown";
import { derivePlayerRoles } from "@/app/lib/player-roles";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { contractVerdict, verdictColor } from "@/app/lib/contract-verdict";
import { getLiveCapCeiling } from "@/app/lib/live-cap-settings";

export const dynamic = "force-dynamic";

async function loadPlayer(playerId: string) {
  const { value } = await getCachedRoster();
  const player = (value.players as any[]).find(p => String(p.id) === playerId);
  return player ?? null;
}

// PA5 — same-position peers for the STRAND compare dropdown. Only the fields
// the trait build reads are shipped, so the client can overlay a comparison
// without a second request. Built from the roster PlayerPage already loaded.
function posGroupOf(pos: string): "F" | "D" | "G" {
  return pos === "G" ? "G" : pos === "D" ? "D" : "F";
}
function buildComparePeers(allPlayers: any[], player: any) {
  const group = posGroupOf(player.position);
  return allPlayers
    .filter(p => String(p.id) !== String(player.id) && p.position !== "Pick")
    .filter(p => posGroupOf(p.position) === group && (p.games ?? 0) >= 20)
    .map(p => ({
      id: String(p.id), name: p.name, position: p.position,
      ops: p.ops ?? null, dps: p.dps ?? null, ptsPace: p.ptsPace ?? null,
      xGPace: p.xGPace ?? null, xgRelTM: p.xgRelTM ?? null, avgTOI: p.avgTOI ?? null,
      xgaRelTM: p.xgaRelTM ?? null, qocIndex: p.qocIndex ?? null, dzPct: p.dzPct ?? null,
      gsax: p.gsax ?? null, savePct: p.savePct ?? null, baselineHdsvPct: p.baselineHdsvPct ?? null,
      gamesStarted: p.gamesStarted ?? null, games: p.games ?? null, shotsPerGame: p.shotsPerGame ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The percentile cohort for the STRAND rails — same position group, ≥20 GP,
// INCLUDING this player, exactly the filter the percentile card uses, so the two
// surfaces rank against the identical field and can never disagree. Slim to the
// metric fields the rails read.
function buildStrandCohort(allPlayers: any[], player: any) {
  const group = posGroupOf(player.position);
  return allPlayers
    .filter(p => p.position !== "Pick" && posGroupOf(p.position) === group && (p.games ?? 0) >= 20)
    .map(p => ({
      ops: p.ops ?? null, dps: p.dps ?? null, ptsPace: p.ptsPace ?? null,
      xGPace: p.xGPace ?? null, xgRelTM: p.xgRelTM ?? null, avgTOI: p.avgTOI ?? null,
      xgaRelTM: p.xgaRelTM ?? null, qocIndex: p.qocIndex ?? null, dzPct: p.dzPct ?? null,
      gsax: p.gsax ?? null, savePct: p.savePct ?? null, baselineHdsvPct: p.baselineHdsvPct ?? null,
      gamesStarted: p.gamesStarted ?? null, gamesPlayed: p.gamesPlayed ?? null, games: p.games ?? null,
      shotsPerGame: p.shotsPerGame ?? null, gaa: p.gaa ?? null,
    }));
}

const STRAND_COHORT_NOUN = { F: "forwards", D: "defensemen", G: "goalies" } as const;

export async function generateMetadata(
  { params }: { params: Promise<{ playerId: string }> },
): Promise<Metadata> {
  const { playerId } = await params;
  const player = await loadPlayer(playerId);
  if (!player) return { title: "Player not found — Cap & Crease" };
  return {
    title: `${player.name} — Cap & Crease`,
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

export default async function PlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const { value: roster } = await getCachedRoster();
  const player = (roster.players as any[]).find(p => String(p.id) === playerId) ?? null;
  if (!player || player.position === "Pick") notFound();

  const teamName = TEAMS_DB.find(t => t.id === player.teamId)?.name ?? player.teamId;
  const position = player.position === "D" || player.position === "G" || player.position === "C"
    ? player.position : "W";
  const capCeiling = await getLiveCapCeiling();

  // Server-side valuation — numbers only from here down.
  const xnav = calculateAssetNAV({
    ...player,
    position,
  }, capCeiling);
  // Display-only v4 lookup. calcNAV above has already completed and imports no
  // v4 code, so even a future validated display profile cannot affect X-NAV.
  const gravityV4Lookup = loadGravityProfileV4({
    playerId: String(player.id),
    season: SEASON.replaySeason,
    position: player.position,
    artifact: GRAVITY_V4_RUNTIME_ARTIFACT,
  });
  const gravityV4 = gravityV4Lookup.status === "ready"
    ? gravityV4Lookup.profile
    : null;
  const gravityV3 = player.position !== "G" && !gravityV4
    ? gravityForDisplay(player)
    : null;
  const roles = derivePlayerRoles(player);
  const comparePeers = buildComparePeers(roster.players as any[], player);
  const strandCohort = buildStrandCohort(roster.players as any[], player);
  const strandCohortLabel = `${STRAND_COHORT_NOUN[posGroupOf(player.position)]}, ≥20 GP, ${SEASON.replaySeason}`;

  // Scatter plot: compute NAV for same-position peers (lightweight — pure sync math)
  const posGroup = posGroupOf(player.position);
  const scatterPeers = (roster.players as any[])
    .filter(p => String(p.id) !== String(player.id) && p.position !== "Pick"
      && posGroupOf(p.position) === posGroup && (p.games ?? 0) >= 20)
    .map(p => {
      try {
        const pos = p.position === "D" || p.position === "G" || p.position === "C" ? p.position : "W";
        const pNav = calculateAssetNAV({ ...p, position: pos }, capCeiling);
        const offStage = pNav.stages?.find((s: any) => s.key === "off");
        const defStage = pNav.stages?.find((s: any) => s.key === "def");
        return {
          id: String(p.id), name: p.name, teamId: p.teamId ?? "",
          off: offStage?.value ?? 0, def: defStage?.value ?? 0,
          nav: pNav.total, age: p.age ?? 0,
        };
      } catch { return null; }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const currentScatter = {
    id: String(player.id), name: player.name, teamId: player.teamId ?? "",
    off: xnav.stages?.find((s: any) => s.key === "off")?.value ?? 0,
    def: xnav.stages?.find((s: any) => s.key === "def")?.value ?? 0,
    nav: xnav.total, age: player.age ?? 0,
  };

  const games = player.games ?? 0;
  const isGoalie = player.position === "G";
  const goals = player.goalsPace != null ? Math.round((player.goalsPace / 82) * games) : null;
  const assists = player.assistsPace != null ? Math.round((player.assistsPace / 82) * games) : null;
  const pts = player.ptsPace != null ? Math.round((player.ptsPace / 82) * games) : null;
  const pm = player.plusMinus;

  // The engine's own waterfall — these sum to the X-NAV printed above them.
  // The previous list did not: DEF was a descriptive rating rather than the
  // value in the total, UPS re-counted AGE, and four multiplicative steps that
  // move the headline appeared nowhere.
  const navComponents = navStagesForDisplay(xnav.stages, xnav.total)
    .map(st => ({ label: navStageShort(st.key), val: st.value, desc: navStageDesc(st.key) }));
  // Two readings of one headline. The blended total is the right number for a
  // trade, but it lets a rich deal swallow a good player — so say which half is
  // which. The two sum to the headline by construction.
  const split = navSplit(xnav.stages, xnav.total);
  // Tone comes from the verdict, so a gap inside the model's error reads
  // neutral rather than being painted green or red by its sign alone.
  const verdict = contractVerdict({
    fmvAav: xnav.fmvAav, capHit: player.capHit, position: player.position,
    expiresThisOffseason: player.expiresThisOffseason, lastCapHit: player.lastCapHit,
  });
  const surplus = verdict.surplus;

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
          <PlayerAvatar name={player.name} position={player.position} size={64} shape="round"
            playerId={player.id} teamId={player.teamId} headshot={player.headshot}
            className="shrink-0" />
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

        {/* Modern role identity */}
        {roles && (
          <div className="border px-4 py-3 mb-3" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[9px] font-black font-mono uppercase tracking-[0.18em]" style={{ color: faint }}>
                Role
              </span>
              <span className="text-[13px] font-black font-mono" style={{ color: roles.primary.color }}>
                {roles.primary.icon} {roles.primary.label}
              </span>
              {roles.secondary && (
                <span className="text-[11px] font-black font-mono" style={{ color: faint }}>
                  · {roles.secondary.icon} {roles.secondary.label}
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono leading-relaxed mt-1" style={{ color: "var(--ledger-ink-body, var(--ledger-ink))" }}>
              {roles.primary.blurb}
            </p>
          </div>
        )}

        {/* Season stats — position-aware */}
        {isGoalie ? (
          <div className="grid grid-cols-5 border mb-3" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
            <StatCell label="GP" value={String(games)} />
            <StatCell
              label="GSAX"
              value={player.gsax != null ? (player.gsax > 0 ? "+" : "") + player.gsax.toFixed(1) : "—"}
              color={player.gsax != null ? (player.gsax > 0 ? "var(--ledger-green)" : player.gsax < 0 ? "var(--ledger-red)" : undefined) : undefined}
            />
            <StatCell
              label="SV%"
              value={player.savePct != null ? (player.savePct * 100).toFixed(1) : "—"}
            />
            <StatCell
              label="GAA"
              value={player.gaa != null ? player.gaa.toFixed(2) : "—"}
            />
            <StatCell label="GS" value={player.gamesStarted != null ? String(player.gamesStarted) : "—"} />
          </div>
        ) : (
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
        )}

        {/* NHL EDGE shot-location detail — goalies only, and only once the
            nightly capture has reached this one. Absent data renders nothing
            rather than an empty panel. */}
        {isGoalie && player.goalieEdgeDetail && (
          <GoalieEdgePanel detail={player.goalieEdgeDetail} playerName={player.name} />
        )}

        {/* The player, and what his contract does to him */}
        {split.known && (
          <div className="border mb-3 grid grid-cols-3" style={{ borderColor: rule, background: "var(--paper-inset)" }} title={navSplitNote(split)}>
            <div className="px-3 py-2 border-r" style={{ borderColor: rule }}>
              <div className="text-[9px] font-black font-mono uppercase tracking-[0.14em]" style={{ color: faint }}>On the ice</div>
              <div className="text-[17px] font-black font-mono" style={{ color: ink }}>{split.production}</div>
            </div>
            <div className="px-3 py-2 border-r" style={{ borderColor: rule }}>
              <div className="text-[9px] font-black font-mono uppercase tracking-[0.14em]" style={{ color: faint }}>His contract</div>
              <div className="text-[17px] font-black font-mono" style={{
                color: split.contract > 0 ? "var(--ledger-green)" : split.contract < 0 ? "var(--ledger-red)" : ink,
              }}>{split.contract > 0 ? "+" : ""}{split.contract}</div>
            </div>
            <div className="px-3 py-2">
              <div className="text-[9px] font-black font-mono uppercase tracking-[0.14em]" style={{ color: faint }}>Trade value</div>
              <div className="text-[17px] font-black font-mono" style={{ color: ink }}>{Math.round(xnav.total)}</div>
            </div>
          </div>
        )}

        {/* NAV components — horizontal diverging bar chart */}
        <div className="border mb-3 px-3 py-3" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
          <NavTrajectoryChart
            stages={navComponents.map(c => ({ label: c.label, value: c.val, desc: c.desc }))}
            total={xnav.total}
            playerName={player.name}
          />
        </div>

        {/* Contract + market */}
        <div className="flex flex-wrap items-center justify-between gap-3 border px-4 py-3 mb-4" style={{ borderColor: rule, background: "var(--paper-inset)" }}>
          <div>
            <div className="text-[9px] font-black font-mono uppercase tracking-[0.14em]" style={{ color: faint }}>
              {verdict.kind === "noContract" ? "Expiring deal" : "Contract"}
            </div>
            <div className="text-[13px] font-black font-mono">
              {/* A pending FA has capHit zeroed on purpose. Printing that zero
                  as his contract is how a free agent became a $9.6M bargain. */}
              {verdict.kind === "noContract"
                ? <>${(player.lastCapHit ?? 0).toFixed(1)}M · <span style={{ color: "var(--ledger-amber)" }}>now a free agent</span></>
                : <>${player.capHit.toFixed(1)}M × {player.yearsRemaining}yr</>}
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
              <div className="text-[13px] font-black font-mono" title={verdict.note} style={{ color: verdictColor(verdict.tone) }}>
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
            <PlayerStrandPanel player={player} peers={comparePeers} cohort={strandCohort} cohortLabel={strandCohortLabel} />
          </div>
        </div>

        {/* League context scatter — OFF vs DEF for same-position peers */}
        {player.position !== "G" && scatterPeers.length >= 5 && (
          <NavLeagueScatter
            peers={scatterPeers}
            currentPlayer={currentScatter}
            playerName={player.name}
          />
        )}

        {/* NHL EDGE shot map — skaters with NHL ids only */}
        {player.position !== "G" && /^\d+$/.test(playerId) && (
          <div className="border p-4 mb-4" style={{ borderColor: rule, background: "var(--paper-card, var(--paper-inset))" }}>
            <div className="text-[9px] font-black font-mono uppercase tracking-[0.18em] mb-3" style={{ color: faint }}>
              NHL EDGE — Shot Locations &amp; Tracking
            </div>
            <EdgeShotMap nhlPlayerId={playerId} />
          </div>
        )}

        {/* Gravity field — computed server-side, rendered client-side from props */}
        {gravityV4 && (
          <div className="border p-4" style={{ borderColor: rule, background: "var(--paper-card, var(--paper-inset))" }}>
            <GravityFieldV4 profile={gravityV4} playerName={player.name} />
          </div>
        )}
        {gravityV3 && (
          <div className="border p-4" style={{ borderColor: rule, background: "var(--paper-card, var(--paper-inset))" }}>
            <GravityField profile={gravityV3} playerName={player.name} mode="full" />
            <div className="mt-4 pt-3 border-t" style={{ borderColor: rule }}>
              <GravityHeatMap
                masses={gravityV3.masses}
                tier={gravityV3.tier}
                force={gravityV3.force}
                isDefenseman={player.position === "D"}
                playerName={player.name}
              />
            </div>
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
