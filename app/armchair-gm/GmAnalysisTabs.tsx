"use client";
// GM analysis tab deck: lineups, Team DNA, comparison, trade breakdown, sim.
import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import { navStagesForDisplay } from "@/app/lib/nav-breakdown";
import { GM_TAB_FALLBACK, nextTab, visibleTab, type GmTab, type GmTabSpec } from "@/app/lib/gm-tabs";
import type { Asset, Team, XNAVResult } from "@/app/lib/trade-types";
import { displayPosition } from "@/app/lib/display-position";
import TeamStrand, { CHAMP_TEMPLATE, type TeamStrandData } from "@/app/components/TeamStrand";
import { computeRosterStrand } from "@/app/lib/roster-strand";
import LineupEditor, { type LineupOrderPayload } from "@/app/components/LineupEditor";
import WhatWeNeed from "@/app/components/WhatWeNeed";
import ContentionQuadrant from "@/app/components/ContentionQuadrant";
import { computeContention, GM_PLUM, GM_PLUM_FAINT, GM_PLUM_LIGHT } from "./contention";
import { tradeAssetKey } from "@/app/store/tradeStore";
import { SeasonResultsPager } from "./SeasonResultsPager";
import { RosterTab } from "./RosterTab";
import { computeTeamEdgeProfile } from "@/app/lib/team-edge-profile";
import TeamEdgeTiles from "./TeamEdgeTiles";

const PlayerComparison = lazy(() => import("@/app/components/PlayerComparison"));

// ── UI-only team classification ────────────────────────────────
// The real classifyTeam logic runs server-side. This stub just reads the
// club's competitive window — the live roster read when Armchair GM has one,
// otherwise the standings tier the API attached to each team.
type TeamMode = "CONTENDER" | "BUBBLE" | "RETOOLING" | "REBUILDING" | "TANKING";

const classifyTeam = (team: Team, _roster: Asset[]): TeamMode => {
  const phase = teamWindow(team);
  if (phase === "Contender")  return "CONTENDER";
  if (phase === "Bubble")     return "BUBBLE";
  if (phase === "Retooling")  return "RETOOLING";
  if (phase === "Tanking")    return "TANKING";
  if (phase === "Rebuilding") return "REBUILDING";
  // Fallback from standing if the window is missing
  if (team.standing <= 8)  return "CONTENDER";
  if (team.standing <= 14) return "BUBBLE";
  if (team.standing > 24)  return "TANKING";
  if (team.standing > 18)  return "REBUILDING";
  return "RETOOLING";
};


import { fmtSigned as fmt } from "@/app/lib/display-utils";
import { teamWindow } from "@/app/lib/team-window";

function GmTabButton({ label, active, onClick, disabled, badge }: {
  label: string; active: boolean; onClick: () => void; disabled?: boolean; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="tab"
      aria-selected={active}
      aria-controls={`gm-panel-${label.toLowerCase().replace(/\s+/g, "-")}`}
      // Only the active tab is in the tab order; arrow keys move between them,
      // which is what a tablist is supposed to do.
      tabIndex={active ? 0 : -1}
      aria-label={`Open ${label} tab`}
      className="tap-target"
      style={{
        flex: "1 1 0",
        padding: "10px 6px",
        fontSize: "11px",
        fontWeight: 900,
        fontFamily: "var(--font-mono, 'Courier Prime', monospace)",
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: disabled ? "var(--ledger-ink-faint, #7a6940)" : active ? "#fff" : GM_PLUM,
        background: active ? GM_PLUM : "transparent",
        border: `2px solid ${active ? GM_PLUM : "var(--ledger-rule, #b8a070)"}`,
        cursor: disabled ? "default" : "pointer",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
        minWidth: 0,
        opacity: disabled ? 0.4 : 1,
        position: "relative",
      }}
      onMouseEnter={e => {
        if (!active && !disabled) {
          (e.target as HTMLElement).style.background = GM_PLUM_FAINT;
          (e.target as HTMLElement).style.borderColor = GM_PLUM_LIGHT;
          (e.target as HTMLElement).style.color = GM_PLUM;
        }
      }}
      onMouseLeave={e => {
        if (!active && !disabled) {
          (e.target as HTMLElement).style.background = "transparent";
          (e.target as HTMLElement).style.borderColor = "var(--ledger-rule, #b8a070)";
          (e.target as HTMLElement).style.color = GM_PLUM;
        }
      }}
    >
      {label}
      {badge != null && badge > 0 && (
        <span style={{
          marginLeft: "5px",
          fontSize: "9px",
          background: active ? "rgba(255,255,255,0.25)" : GM_PLUM,
          color: active ? "#fff" : "#fff",
          padding: "1px 4px",
          borderRadius: "2px",
          fontWeight: 900,
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

export function GmAnalysisTabs({
  teams, allHomeRoster, allPartnerRoster, blocks, navMap, db,
  lineupOrders, handleGoalieStarterChange, handleLineupChange, executedTrades,
  simYear, simLoading, simData, simResult,
}: {
  teams: [Team, Team];
  allHomeRoster: Asset[];
  allPartnerRoster: Asset[];
  blocks: [Asset[], Asset[]];
  navMap: Record<string, XNAVResult>;
  db: { teams: Team[]; players: Asset[]; capCeiling?: number | null };
  lineupOrders: Record<string, LineupOrderPayload>;
  handleGoalieStarterChange: (teamId: string, goalieId: string | null) => void;
  handleLineupChange: (teamId: string, order: LineupOrderPayload) => void;
  executedTrades: { id: string; homeTeamName: string; partnerTeamName: string; outgoing: Asset[]; incoming: Asset[]; timestamp: number; }[];
  simYear: () => void;
  simLoading: boolean;
  simData: any;
  simResult: string | null;
}) {
  // What the user picked. Held even while it is unusable, so putting assets
  // back on the block returns them to the tab they were reading.
  const [selectedTab, setSelectedTab] = useState<GmTab>(GM_TAB_FALLBACK);
  const hasAssets = blocks[0].length > 0 || blocks[1].length > 0;

  const tabs: (GmTabSpec & { label: string; badge?: number })[] = [
    { key: "roster", label: "Roster" },
    { key: "lineups", label: "Lineups" },
    { key: "dna", label: "Team DNA" },
    { key: "comparison", label: "Compare", disabled: !hasAssets },
    { key: "breakdown", label: "Breakdown", disabled: !hasAssets },
    // The Sim tab is always available — a season can be run on the baseline
    // league with zero trades. The badge only appears once trades exist.
    { key: "sim", label: "Sim", badge: executedTrades.length > 0 ? executedTrades.length : undefined },
  ];

  // Executing a trade clears the blocks, which disables whichever of Compare or
  // Breakdown the user was reading. Derived rather than stored, so the empty
  // panel is never painted and the selection survives to be restored.
  const activeTab = visibleTab(tabs, selectedTab);

  // A trade's point is its consequences, and those are in the Sim tab.
  //
  // Keyed on the trade COUNT rising, not on a flag. CXH1 first used
  // `showSimPanel`, which is set true on execute and only cleared on reset — so
  // it has no edge to detect on a second trade in the same session, and the
  // user was left on Roster while the Sim tab quietly grew a second entry. A
  // count answers "did another trade just happen"; a latched boolean cannot.
  // Comparing against the previous count also means a remount does not yank the
  // user off a tab they chose since, and a reset (count to zero) does not fire.
  const tradeCountWas = useRef(executedTrades.length);
  useEffect(() => {
    if (executedTrades.length > tradeCountWas.current) setSelectedTab("sim");
    tradeCountWas.current = executedTrades.length;
  }, [executedTrades.length]);

  return (
    <div style={{ marginTop: "8px", marginBottom: "16px" }}>
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Analysis views"
        onKeyDown={(e) => {
          const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          const next = nextTab(tabs, activeTab, dir);
          if (next) setSelectedTab(next);
        }}
        style={{
        display: "flex",
        gap: 0,
        background: "#e4d8b8",
        borderBottom: `2px solid ${GM_PLUM}`,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {tabs.map(t => (
          <GmTabButton
            key={t.key}
            label={t.label}
            active={activeTab === t.key}
            onClick={() => !t.disabled && setSelectedTab(t.key)}
            disabled={t.disabled}
            badge={t.badge}
          />
        ))}
      </div>

      {/* Tab content */}
      <div
        role="tabpanel"
        id={`gm-panel-${(tabs.find(t => t.key === activeTab)?.label ?? "").toLowerCase().replace(/\s+/g, "-")}`}
        style={{
        borderTop: `3px solid ${GM_PLUM}`,
        background: "var(--ledger-card-light, #f0e8d0)",
        padding: "0",
      }}>
        {/* ── Roster tab (RL2) ───────────────────── */}
        {activeTab === "roster" && (
          <RosterTab
            teams={teams}
            homeRoster={allHomeRoster}
            partnerRoster={allPartnerRoster}
            navMap={navMap}
            simData={simData}
          />
        )}

        {/* ── Lineups tab ────────────────────────── */}
        {activeTab === "lineups" && (
          <div style={{ padding: "12px 0" }}>
            <LineupEditor
              home={{
                teamId: teams[0].id,
                teamName: teams[0].name, label: "Your Franchise",
                roster: allHomeRoster, outgoing: blocks[0],
                incoming: blocks[1].filter(a => a.position !== "Pick"),
              }}
              partner={{
                teamId: teams[1].id,
                teamName: teams[1].name, label: "Trade Partner",
                roster: allPartnerRoster, outgoing: blocks[1],
                incoming: blocks[0].filter(a => a.position !== "Pick"),
              }}
              hasActiveTrade={blocks[0].length > 0 || blocks[1].length > 0}
              navMap={navMap}
              savedLineupOrders={lineupOrders}
              onGoalieStarterChange={handleGoalieStarterChange}
              onLineupChange={handleLineupChange}
            />
          </div>
        )}

        {/* ── Team DNA tab ───────────────────────── */}
        {activeTab === "dna" && (
          <div style={{ padding: "12px 0" }}>
            <TeamDNA
              homeTeam={teams[0]}
              partnerTeam={teams[1]}
              homeRoster={allHomeRoster}
              partnerRoster={allPartnerRoster}
              homeBlocks={blocks[0]}
              partnerBlocks={blocks[1]}
              navMap={navMap}
              db={db}
            />
          </div>
        )}

        {/* ── Comparison tab ─────────────────────── */}
        {activeTab === "comparison" && hasAssets && (
          <div style={{ padding: "12px 0" }}>
            <Suspense fallback={<div className="h-32 animate-pulse bg-ledger-card rounded" />}>
              <PlayerComparison
                outgoing={blocks[0]}
                incoming={blocks[1]}
                navMap={navMap}
              />
            </Suspense>
          </div>
        )}

        {/* ── Breakdown tab ──────────────────────── */}
        {activeTab === "breakdown" && hasAssets && (
          <div style={{ padding: "12px 0" }}>
            <BreakdownTable blocks={blocks} navMap={navMap} />
          </div>
        )}

        {/* ── Sim tab ────────────────────────────── */}
        {activeTab === "sim" && (
          <div style={{ overflow: "hidden" }}>
            <div style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--ledger-rule, #b8a070)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span style={{
                fontSize: "10px", fontWeight: 900, textTransform: "uppercase",
                letterSpacing: "0.4em", color: GM_PLUM,
                fontFamily: "var(--font-mono, monospace)",
              }}>
                {executedTrades.length === 0
                  ? "Simulated Universe — Baseline (No Trades)"
                  : `Simulated Universe — ${executedTrades.length} Trade${executedTrades.length !== 1 ? "s" : ""} Executed`}
              </span>
              <button
                onClick={simYear}
                disabled={simLoading}
                aria-label="Simulate one season"
                className="tap-target"
                style={{
                  padding: "6px 12px",
                  fontSize: "10px",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  background: GM_PLUM,
                  color: "#fff",
                  border: `2px solid ${GM_PLUM}`,
                  cursor: simLoading ? "not-allowed" : "pointer",
                  opacity: simLoading ? 0.4 : 1,
                  fontFamily: "var(--font-mono, monospace)",
                }}>
                {simLoading ? "Simulating..." : "Sim a Year"}
              </button>
            </div>

            <div style={{ padding: "12px 16px" }}>
              {executedTrades.map((t) => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "flex-start", gap: "10px",
                  fontSize: "11px", marginBottom: "6px",
                  fontFamily: "var(--font-mono, monospace)",
                }}>
                  <span style={{ color: "var(--ledger-green)", fontWeight: 900, flexShrink: 0 }}>✓</span>
                  <div>
                    <span style={{ fontWeight: 900, color: "var(--ledger-ink)" }}>{t.homeTeamName}</span>
                    <span style={{ color: "var(--ledger-ink-faint)", margin: "0 6px" }}>sent</span>
                    <span style={{ color: "var(--ledger-red)" }}>{t.outgoing.map(a => a.name).join(", ")}</span>
                    <span style={{ color: "var(--ledger-ink-faint)", margin: "0 6px" }}>→</span>
                    <span style={{ color: GM_PLUM, fontWeight: 700 }}>{t.incoming.map(a => a.name).join(", ")}</span>
                    <span style={{ color: "var(--ledger-ink-faint)", margin: "0 6px" }}>from</span>
                    <span style={{ fontWeight: 900, color: "var(--ledger-ink)" }}>{t.partnerTeamName}</span>
                  </div>
                </div>
              ))}
            </div>

            {(simData || simResult) && (
              <SeasonResultsPager simData={simData} simResult={simResult} players={db.players} navMap={navMap} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamDNA({
  homeTeam, partnerTeam, homeRoster, partnerRoster, homeBlocks, partnerBlocks, navMap, db
}: {
  homeTeam: Team | null;
  partnerTeam: Team | null;
  homeRoster: Asset[];
  partnerRoster: Asset[];
  homeBlocks: Asset[];
  partnerBlocks: Asset[];
  navMap: Record<string, XNAVResult>;
  db: { players: Asset[]; teams: Team[] };
}) {
  const [expanded, setExpanded] = React.useState(true);

  // Post-trade roster: remove outgoing, add incoming
  // This makes the panel react live to trade changes
  const effectiveHomeRoster = React.useMemo(() => {
    const outKeys = new Set(homeBlocks.map(tradeAssetKey));
    return [
      ...homeRoster.filter(p => !outKeys.has(tradeAssetKey(p))),
      ...partnerBlocks.filter(a => a.position !== "Pick"),
    ];
  }, [homeRoster, homeBlocks, partnerBlocks]);

  const effectivePartnerRoster = React.useMemo(() => {
    const outKeys = new Set(partnerBlocks.map(tradeAssetKey));
    return [
      ...partnerRoster.filter(p => !outKeys.has(tradeAssetKey(p))),
      ...homeBlocks.filter(a => a.position !== "Pick"),
    ];
  }, [partnerRoster, homeBlocks, partnerBlocks]);

  const hasActiveTrade = homeBlocks.length > 0 || partnerBlocks.length > 0;

  const homeStrand    = computeRosterStrand(effectiveHomeRoster, navMap);
  const partnerStrand = computeRosterStrand(effectivePartnerRoster, navMap);
  const preTradeHomeStrand = hasActiveTrade ? computeRosterStrand(homeRoster, navMap) : null;
  const preTradePartnerStrand = hasActiveTrade ? computeRosterStrand(partnerRoster, navMap) : null;
  if (!homeStrand || !partnerStrand) return null;

  // Contention ratings — derived from X-NAV
  const homeContention    = computeContention(effectiveHomeRoster, navMap);
  const partnerContention = computeContention(effectivePartnerRoster, navMap);
  const homeEdgeProfile = computeTeamEdgeProfile(effectiveHomeRoster);
  const partnerEdgeProfile = computeTeamEdgeProfile(effectivePartnerRoster);

  // Gap vs championship template — negative = below template, positive = above
  const homeGaps = {
    off: Object.entries(CHAMP_TEMPLATE.off).map(([k, target]) => ({
      label: k, gap: (homeStrand.off as any)[k] - target
    })),
    def: Object.entries(CHAMP_TEMPLATE.def).map(([k, target]) => ({
      label: k, gap: (homeStrand.def as any)[k] - target
    })),
  };

  // Top needs: biggest negative gaps
  const allGaps = [...homeGaps.off, ...homeGaps.def]
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 3);

  // Team Strand displays — use TeamStrand component for clean 4+4 helix
  return (
    <div className="strands-panel">
      <button className="strands-header" onClick={() => setExpanded(e => !e)}>
        <div className="strands-header-left">
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
            <path d="M0,3 C2,3 2,9 4,9 C6,9 6,3 8,3 C10,3 10,9 12,9 C14,9 14,3 16,3"
              fill="none" stroke="var(--blue)" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M0,9 C2,9 2,3 4,3 C6,3 6,9 8,9 C10,9 10,3 12,3 C14,3 14,9 16,9"
              fill="none" stroke="var(--red)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="strands-title">Team Strands</span>
          {hasActiveTrade && <span className="strands-post-trade-badge">Post-Trade</span>}
        </div>
        <div className="strands-header-right" style={{ flexWrap: 'wrap', gap: '4px' }}>
          {allGaps.slice(0, 3).map(g => (
            <span key={g.label} className={`strands-need-pill${g.gap < -0.15 ? ' urgent' : ''}`}>
              {g.label} {g.gap < -0.15 ? '↓' : '~'}
            </span>
          ))}
          <span className="data-label">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="strands-body">
          <p className="strands-context" style={{ wordBreak: "break-word", overflowWrap: "break-word" }}>
            Each helix shows a team's aggregate offensive (ice blue) and defensive (red) profile across their top-9 forwards and top-4 D by ice time. The dashed gold line is the championship template. The dotted green line is the playoff threshold. Gaps below either line are roster needs.{hasActiveTrade ? " Updated to reflect the current trade." : ""}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-4" style={{ overflowX: 'auto' }}>
            {([
              { strand: homeStrand,    team: homeTeam,    label: hasActiveTrade ? "Post-trade" : undefined, compare: preTradeHomeStrand },
              { strand: partnerStrand, team: partnerTeam, label: hasActiveTrade ? "Post-trade" : undefined, compare: preTradePartnerStrand },
            ]).map(({ strand, team, label, compare }: { strand: TeamStrandData | null; team: any; label: string | undefined; compare: TeamStrandData | null }) => strand && team ? (
              <div key={team.id} style={{ flex: 1, minWidth: 260, background: 'var(--ledger-cream)',
                                         border: '1px solid #c8b890', padding: '10px 12px' }}>
                <TeamStrand strand={strand} teamName={team.name} label={label} compare={compare ?? undefined} />
              </div>
            ) : null)}
          </div>

          <TeamEdgeTiles
            homeTeam={homeTeam}
            partnerTeam={partnerTeam}
            homeProfile={homeEdgeProfile}
            partnerProfile={partnerEdgeProfile}
            hasActiveTrade={hasActiveTrade}
          />

          {/* ── Contention Quadrant ── */}
          {homeTeam && partnerTeam && (
            <div style={{ marginBottom: 16 }}>
              <ContentionQuadrant
                home={homeContention}
                partner={partnerContention}
                homeTeamName={homeTeam.name}
                partnerTeamName={partnerTeam.name}
              />
            </div>
          )}

          <div className="strands-gaps-header">
            {homeTeam?.name} — Roster Gaps vs Playoff & Championship Thresholds{hasActiveTrade ? " (post-trade)" : ""}
          </div>

          {/* Metric explanations + WhatWeNeed */}
          {(() => {
            const GAP_EXPLAIN: Record<string, { full: string; need: string }> = {
              OPS:   { full: "Offensive Point Shares", need: "More offensive output across the lineup"    },
              xG:    { full: "Expected Goals",         need: "Higher quality shot generation"            },
              NOIV:  { full: "On-Ice Impact",          need: "Players who elevate their linemates"       },
              TOI:   { full: "Ice Time Quality",       need: "Heavier usage from top players"            },
              DPS:   { full: "Defensive Point Shares", need: "More defensive value across the roster"    },
              SUPP:  { full: "Shot Suppression",       need: "Better defensive structure under pressure" },
              Usage: { full: "Ice Time Deployment",    need: "Players who can handle tougher matchups"   },
              OZ:    { full: "Zone Deployment",        need: "More offensive-zone focused personnel"     },
            };
            const allGapsSorted = [...homeGaps.off, ...homeGaps.def].sort((a, b) => a.gap - b.gap);
            const gapsWithExplain = allGapsSorted.map(g => ({
              ...g,
              full: GAP_EXPLAIN[g.label]?.full ?? g.label,
              need: GAP_EXPLAIN[g.label]?.need ?? `Improve ${g.label}`,
            }));
            const excludeIds = new Set([
              ...homeRoster.map(p => p.id),
              ...partnerRoster.map(p => p.id),
            ]);
            return (
              <>
                {/* What This Team Needs — gaps with real player suggestions */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--ledger-ink-faint)',
                                textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6,
                                fontFamily: "'Courier Prime', monospace" }}>
                    🔍 What This Team Needs{hasActiveTrade ? ' (post-trade)' : ''}
                  </div>
                  <WhatWeNeed
                    gaps={gapsWithExplain}
                    db={db}
                    excludeIds={excludeIds}
                    homeCapSpace={homeTeam ? (db.teams.find(t => t.id === homeTeam.id)?.capSpace ?? 8) : 8}
                  />
                </div>

                {/* Gap bars */}
                <div className="strands-gaps-grid">
                  {allGapsSorted.map(g => {
                    const pct = Math.min(48, Math.abs(g.gap) * 180);
                    const valClass = g.gap < -0.10 ? 'deficit' : g.gap > 0.05 ? 'surplus' : 'neutral';
                    const explain = GAP_EXPLAIN[g.label];
                    return (
                      <div key={g.label} className="strands-gap-row" title={explain ? `${explain.full}: ${explain.need}` : g.label}>
                        <span className="strands-gap-label" style={{ cursor: 'help' }} title={explain?.full}>{g.label}</span>
                        <div className="strands-gap-track">
                          <div className="strands-gap-left">
                            {g.gap < 0 && (
                              <div className="strands-gap-fill-deficit" style={{ width: `${pct * 2}%` }}/>
                            )}
                          </div>
                          <div className="strands-gap-divider"/>
                          <div className="strands-gap-right">
                            {g.gap >= 0 && (
                              <div className="strands-gap-fill-surplus" style={{ width: `${pct * 2}%` }}/>
                            )}
                          </div>
                        </div>
                        <span className={`strands-gap-value ${valClass}`}>
                          {g.gap > 0 ? '+' : ''}{(g.gap * 100).toFixed(0)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          <div className="strands-legend">
            <span><span style={{ color: 'var(--red)' }}>■</span> Below playoff threshold</span>
            <span><span style={{ color: 'var(--green)' }}>■</span> Exceeds template</span>
            <span><span className="text-ledger-green">· ·</span> Playoff threshold</span>
            <span><span style={{ color: 'var(--rule)' }}>— —</span> Championship standard</span>
            <span style={{ color: 'var(--ledger-ink-faint)', fontSize: '9px' }}>Hover metric labels for explanations</span>
          </div>
        </div>
      )}
    </div>
  );
}
// ============================================================
// TEAM MODE BADGE
// ============================================================
export function ModeBadge({ team, roster, label }: { team: Team; roster: Asset[]; label: string }) {
  const mode = classifyTeam(team, roster);
  const config: Record<TeamMode, { color: string; bg: string }> = {
    CONTENDER:  { color: "text-emerald-300", bg: "bg-emerald-950/40 border-emerald-800/50" },
    BUBBLE:     { color: "text-sky-300",     bg: "bg-sky-950/40 border-sky-800/50" },
    RETOOLING:  { color: "text-amber-300",   bg: "bg-amber-950/40 border-amber-800/50" },
    REBUILDING: { color: "text-orange-300",  bg: "bg-orange-950/40 border-orange-800/50" },
    TANKING:    { color: "text-rose-300",    bg: "bg-rose-950/40 border-rose-800/50" },
  };
  const c = config[mode];
  return (
    <div className={`border rounded-lg px-2 py-1.5 text-center ${c.bg}`}>
      <div className="text-2xs font-black uppercase tracking-widest text-zinc-700 mb-0.5">{label}</div>
      <div className={`text-2xs font-black uppercase tracking-tight ${c.color}`}>{mode}</div>
    </div>
  );
}

// ============================================================

// ============================================================
// BREAKDOWN TABLE
// ============================================================
// ============================================================
// BREAKDOWN TABLE
// ============================================================
function BreakdownTable({ blocks, navMap }: { blocks: [Asset[], Asset[]]; navMap: Record<string, XNAVResult> }) {
  const allAssets = [
    ...blocks[0].map((a) => ({ ...a, side: "OUT" as const })),
    ...blocks[1].map((a) => ({ ...a, side: "IN" as const })),
  ];

  return (
    <div className="bg-zinc-900/30 border border-zinc-800/40 rounded-2xl overflow-hidden">
      <div className="px-3 sm:px-6 py-3 border-b border-zinc-800/40 flex items-center gap-2">
        <span className="text-2xs font-black uppercase tracking-[0.4em] text-zinc-600">Full NAV Breakdown</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-zinc-800/30">
              {["Side", "Player", "Pos", "Age", "Pts/82", "xG/82", "DefRate", "Avg TOI", "Cap", "Term", "X-NAV", "Off", "Def", "Age/YNG", "Cap Cost", "Floor"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-2xs font-black uppercase tracking-wider text-zinc-600"
                  title={h === "X-NAV" ? "X-NAV — Extended Net Asset Value, the player’s tradeable value" : h === "Floor" ? "Franchise/career floor applied" : undefined}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allAssets.map((a) => {
              const xnav = navMap[a.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };
              const isOut = a.side === "OUT";
              const ptsPace = a.ptsPace ?? 0;
              const xgPace = a.xGPace ?? 0;
              const defRate = a.defRate ?? 0;
              const avgTOI = a.avgTOI ?? 0;
              const capHit = a.capHit ?? 0;
              // The engine's own adjustments, summed. This was a plug —
              // `total − (off + def + age + cap)` — labelled "Franchise/career
              // floor applied", which was a guess at what the gap was. It is
              // the actual adjustment rows now, and the tooltip names them.
              const adjustments = navStagesForDisplay(xnav.stages, xnav.total).filter(st => st.kind === "adjustment");
              const floorAdj = adjustments.reduce((sum, st) => sum + st.value, 0);
              const adjTitle = adjustments.length > 0
                ? adjustments.map(st => `${st.label} ${st.value >= 0 ? "+" : ""}${st.value}`).join(" · ")
                : "No model adjustments applied";
              return (
                <tr key={`${a.side}:${tradeAssetKey(a)}`} className={`border-b border-zinc-900 hover:bg-zinc-800/20 transition-colors ${isOut ? "bg-rose-950/5" : "bg-emerald-950/5"}`}>
                  <td className="px-3 py-2">
                    <span className={`text-2xs font-black px-1.5 py-0.5 rounded ${isOut ? "bg-rose-900/30 text-rose-400" : "bg-emerald-900/30 text-emerald-400"}`}>
                      {a.side}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-sans font-black text-white text-[11px] whitespace-nowrap">{a.name}</td>
                  <td className="px-3 py-2 text-zinc-500">{displayPosition(a.position, a.secondaryPosition)}</td>
                  <td className="px-3 py-2 text-zinc-400">{a.age}</td>
                  <td className="px-3 py-2 text-cyan-400">{a.position === "Pick" ? "—" : a.position === "G" ? `${(a.savePct ?? 0).toFixed(3)}` : ptsPace.toFixed(1)}</td>
                  <td className="px-3 py-2 text-violet-400">{a.position === "Pick" ? "—" : a.position === "G" ? `${(a.gsax ?? 0).toFixed(1)} GSAx` : xgPace.toFixed(1)}</td>
                  <td className={`px-3 py-2 ${defRate > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {a.position === "Pick" ? "—" : fmt(defRate, 2)}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{a.position === "Pick" ? "—" : avgTOI.toFixed(1)}</td>
                  {/* ── NEW: Extension styling on the Cap Hit column ── */}
                  <td className={`px-3 py-2 ${a.hasExtension ? "text-amber-500 font-bold" : "text-amber-400"}`} title={a.hasExtension ? "Valuation based on future extension AAV" : undefined}>
                    {a.position === "Pick" ? "—" : `$${capHit.toFixed(2)}M${a.hasExtension ? '*' : ''}`}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{a.position === "Pick" ? "—" : `${a.yearsRemaining}yr`}</td>
                  <td className={`px-3 py-2 font-black text-[12px] ${xnav.total > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {fmt(xnav.total, 1)}
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{xnav.off.toFixed(0)}</td>
                  <td className="px-3 py-2 text-zinc-500">{xnav.def.toFixed(0)}</td>
                  <td className={`px-3 py-2 ${xnav.age > 0 ? "text-violet-400" : "text-amber-500"}`}>
                    {fmt(xnav.age, 0)}
                  </td>
                  <td className="px-3 py-2 text-rose-500">{xnav.cap.toFixed(0)}</td>
                  <td className="px-3 py-2 text-amber-500" title={adjTitle}>
                    {Math.abs(floorAdj) >= 1 ? fmt(floorAdj, 0) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
