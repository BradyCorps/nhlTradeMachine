"use client";
// ── AssetCard — individual player/pick card in trade panels ───
import React from "react";
import { PlayerAvatar } from "@/app/components/PlayerAvatar";
import type { Asset, Team, XNAVResult } from "@/app/lib/trade-types";
import { computeGravity, gravityTierColor } from "@/app/lib/gravity";
import GravityField, { CompactGravity, TierIcon } from "@/app/components/GravityField";
import { PlayerOutlook } from "@/app/components/PlayerOutlook";
import { getPlayerPedigree } from "@/app/lib/player-data";
import { boxScoreFromPace } from "@/app/lib/box-score";
import { HISTORICAL_MAX_OFF, HISTORICAL_MAX_DEF } from "@/app/lib/historical-benchmarks";
import { MicroBar } from "@/app/components/MicroBar";
import StrandView from "@/app/components/StrandView";
import PlayerTimeline from "@/app/components/PlayerTimeline";
import { tradeAssetKey, useTradeStore } from "@/app/store/tradeStore";
import { AssetBadges } from "@/app/components/AssetBadges";
import { formatPickRound } from "@/app/lib/trade-format";
import { contractExpiryYear } from "@/app/lib/contract-expiry";
import EdgeShotMap from "@/app/components/EdgeShotMap";
import MeasuredProfile from "@/app/components/MeasuredProfile";
import { displayPosition } from "@/app/lib/display-position";

import { fmtSigned as fmt } from "@/app/lib/display-utils";
// RL3 — DEV is gone from the trade card. The dynasty/boom-bust read it showed
// is a fantasy question, and it still lives in DevelopmentProfilePanel on the
// fantasy and docket surfaces; what a GM evaluating a trade needs is the
// analytics-desk read, which is OUTLOOK (PA12: trajectory + next season, with
// NHL EDGE as the leading indicator). GRAVITY was a one-line strip buried at
// the bottom of STATS despite being the model this app is built around.
type AssetCardView = "STATS" | "STRAND" | "EDGE" | "GRAVITY" | "OUTLOOK" | "TIMELINE";

export default function AssetCard({
  asset, idx, onRequestTrade, navResult, cupYear
}: {
  asset: Asset;
  idx: 0 | 1;
  onRequestTrade?: (a: Asset) => void;
  navResult?: XNAVResult;
  /** Cup Run year (1-3). Omit outside a run — expiry then reads season one. */
  cupYear?: number | null;
}) {
  const blocks = useTradeStore(s => s.blocks);
  const navMap = useTradeStore(s => s.navMap);
  const updateBlock = useTradeStore(s => s.updateBlock);
  const removeAssetFromStore = useTradeStore(s => s.removeAsset);
  const setRetainedPctStore = useTradeStore(s => s.setRetainedPct);

  const [view, setView] = React.useState<AssetCardView>("STATS");
  const pedigree = getPlayerPedigree(asset.name);
  const [compareId, setCompareId] = React.useState<string>("");
  const xnav   = navResult ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };
  const isPick = asset.position === "Pick";
  const displayedDef = asset.dps != null ? Math.round(asset.dps * 15) : xnav.def;
  const floorAdj = Math.round(xnav.total) - Math.round(xnav.off + displayedDef + xnav.age + xnav.cap);

  const otherBlock = blocks[1 - idx].filter(a =>
    a.position !== "Pick" && a.id !== asset.id
  );
  const compareAsset = otherBlock.find(a => a.id === compareId) ?? null;
  const compareXnav  = compareAsset
    ? (navMap?.[compareAsset.id] ?? { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 })
    : null;
  // One computation, three consumers: the badge, the GRAVITY tab's existence
  // and its panel. The gate is deliberately strict — a goalie has no gravity
  // profile, and under 10 games there is not enough signal to draw a field
  // from. A tab that opens onto nothing is worse than no tab.
  const gravProfile = React.useMemo(() => {
    if (isPick || asset.position === "G" || (asset.games ?? 0) < 10) return null;
    return computeGravity(asset as any);
  }, [asset, isPick]);
  const gravTier = gravProfile?.tier;
  const showGravBadge = gravTier === "SUPERMASSIVE" || gravTier === "STAR";

  const hasOutlook = Boolean(asset.developmentProfile && !isPick);
  const retentionPct = Math.round((asset.retainedPct || 0) * 100);
  const setRetentionPct = (pct: number) => {
    const clamped = Math.max(0, Math.min(50, Math.round(pct / 5) * 5));
    updateAsset({ retainedPct: clamped / 100 });
  };

  const updateAsset = (partial: Partial<Asset>) => {
    const targetKey = tradeAssetKey(asset);
    updateBlock(idx, blocks[idx].map((a) => tradeAssetKey(a) === targetKey ? { ...a, ...partial } : a));
  };

  const removeAsset = () => {
    removeAssetFromStore(asset.id, idx, asset.teamId);
  };

  const navColor = xnav.total > 80 ? 'var(--ledger-green)' : xnav.total > 20 ? 'var(--ledger-ice)' : xnav.total > -20 ? 'var(--ledger-brown)' : 'var(--ledger-red)';

  return (
    <div className="p-3 transition-all">
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <PlayerAvatar name={asset.name} position={asset.position} size={32} />
          <div className="min-w-0">
            <div className="font-black leading-tight flex flex-wrap items-center gap-1.5"
              style={{ fontSize: '13px', color: 'var(--ledger-ink)' }}>
              <span className="truncate max-w-full">{asset.name}</span>
              {asset.tradeBlockStatus === 'untouchable' && (
                <span className="text-2xs font-black shrink-0 inline-flex items-center justify-center rounded-sm"
                  title="Untouchable — excluded from partner matching"
                  style={{ color: 'var(--blue)', border: '1px solid rgba(43,87,102,0.5)', background: 'var(--blue-dim)', width: 18, height: 18 }}>
                  ◈
                </span>
              )}
              {asset.tradeBlockStatus === 'requested' && (
                <span className="text-2xs px-1 font-black shrink-0" title={asset.tradeBlockNote ?? "Formal trade request"}
                  style={{ color: 'var(--red)', border: '1px solid rgba(166,53,36,0.5)', background: 'var(--red-dim)' }}>
                  ◉ REQUESTED
                </span>
              )}
              {asset.tradeBlockStatus === 'available' && (
                <span className="text-2xs px-1 font-black shrink-0" title={asset.tradeBlockNote ?? "Being shopped"}
                  style={{ color: 'var(--amber)', border: '1px solid rgba(148,105,20,0.5)', background: 'var(--amber-dim)' }}>
                  ◉ SHOPPED
                </span>
              )}
              {asset.hasNMC && <span className="text-2xs px-1 font-black shrink-0" style={{ color: 'var(--ledger-red)', border: '1px solid #b83020' }}>NMC</span>}
              {asset.hasNTC && !asset.hasNMC && <span className="text-2xs px-1 font-black shrink-0" style={{ color: 'var(--ledger-amber)', border: '1px solid #8a5c00' }}>NTC</span>}
              {!asset.hasLiveStats && !isPick && <span className="text-2xs px-1 font-black shrink-0" style={{ color: 'var(--ledger-ink-faint)', border: '1px solid #b8a070' }}>EST</span>}
              {asset.hasExtension && (
                <span className="text-2xs px-1 font-black shrink-0 shadow-sm rounded-sm"
                  style={{ background: 'var(--ledger-orange)', color: 'white', border: '1px solid #b45309' }}
                  title="Future contract extension applied to valuation">
                  EXTENSION
                </span>
              )}
              {showGravBadge && gravTier && (
                <span className="shrink-0 inline-flex items-center justify-center"
                  title={`${gravTier === "SUPERMASSIVE" ? "Supermassive" : "Star"} gravity — force ${gravProfile!.force.toFixed(2)}`}
                  style={{ minWidth: 18, height: 18, border: `1px solid ${gravityTierColor(gravTier)}`, background: "rgba(255,255,255,0.18)", padding: "0 2px" }}>
                  <TierIcon tier={gravTier} size={14} />
                </span>
              )}
            </div>
            
            <div className="text-2xs font-bold uppercase tracking-wider mt-0.5 text-ledger-ink-faint font-mono">
              {isPick
                ? `${asset.year} · ${formatPickRound(asset.round)} Round`
                : (() => {
                    const expiryYear = contractExpiryYear(asset.yearsRemaining, cupYear);
                    const extCap   = (asset as any).extensionCapHit;
                    const extYears = (asset as any).extensionYears;
                    if (asset.hasExtension && extCap) {
                      // Show both: current cheap deal + incoming expensive extension
                      return (
                        <span>
                          {displayPosition(asset.position, asset.secondaryPosition)} · Age {asset.age} ·{' '}
                          <span className="text-ledger-brown">${asset.capHit.toFixed(2)}M × {asset.yearsRemaining}yr</span>
                          <span className="text-ledger-ink-faint"> → </span>
                          <span className="text-ledger-orange">EXT ${extCap.toFixed(2)}M × {extYears}yr</span>
                        </span>
                      );
                    }
                    if (asset.hasExtension) {
                      return (
                        <span className="text-ledger-orange">
                          {displayPosition(asset.position, asset.secondaryPosition)} · Age {asset.age} · ${asset.capHit.toFixed(2)}M × {asset.yearsRemaining}yr · EXTENDED
                        </span>
                      );
                    }
                    // Show effective cap hit when retention is active — the receiving
                    // team only pays the retained-down portion, not the full cap hit.
                    if ((asset.retainedPct || 0) > 0) {
                      const effectiveCap = asset.capHit * (1 - asset.retainedPct!);
                      return (
                        <span>
                          {displayPosition(asset.position, asset.secondaryPosition)} · Age {asset.age} ·{' '}
                          <span className="text-emerald-500">${effectiveCap.toFixed(2)}M × {asset.yearsRemaining}yr</span>
                          <span className="text-ledger-ink-faint text-2xs ml-1">(${asset.capHit.toFixed(2)}M − {Math.round(asset.retainedPct! * 100)}% retained)</span>
                        </span>
                      );
                    }
                    return `${displayPosition(asset.position, asset.secondaryPosition)} · Age ${asset.age} · $${asset.capHit.toFixed(2)}M × ${asset.yearsRemaining}yr · Exp. ${expiryYear}`;
                  })()}
            </div>
            
            {/* Asset Badges */}
            <AssetBadges asset={asset} xnav={xnav} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className="flex flex-col items-end gap-0.5">
          <span className="font-black" style={{
            fontSize: '1.1rem',
            fontStyle: 'italic',
            color: xnav.total > 80 ? 'var(--ledger-green)' : xnav.total > 20 ? 'var(--ledger-ice)' : xnav.total > -20 ? 'var(--ledger-brown)' : 'var(--ledger-red)',
          }} title="X-NAV — Extended Net Asset Value, the player’s tradeable value">
            {fmt(xnav.total, 0)}
          </span>
          {xnav.noivImpact !== undefined && Math.abs(xnav.noivImpact) >= 2 && (
            <span className="text-2xs font-black" style={{
              color: xnav.noivImpact > 0 ? 'var(--ledger-green)' : 'var(--ledger-red)',
              letterSpacing: '0.05em',
            }} title={`NOIV Impact: ${xnav.noivImpact > 0 ? '+' : ''}${xnav.noivImpact.toFixed(0)}. ${xnav.noivImpact > 0 ? 'Elevates teammates beyond raw stats.' : 'On-ice context reduces value vs raw stats.'}`}>
              {xnav.noivImpact > 0 ? '↑' : '↓'} {Math.abs(xnav.noivImpact).toFixed(0)} NOIV
            </span>
          )}
          </div>
          {!isPick && idx === 0 && (
            <button onClick={() => onRequestTrade?.(asset)} title="Generate trade proposals"
              className="font-bold leading-none transition-colors text-ink-faint text-[11px]">
              ⚡
            </button>
          )}
          <button onClick={removeAsset} className="font-bold leading-none transition-colors text-ink-faint text-[13px]">
            ✕
          </button>
        </div>
      </div>

      {/* STRAND / STATS tab toggle — only for skaters with live data */}
      {!isPick && (
        <div className="flex gap-0 mb-2" style={{ borderBottom: '1px solid #c8b890' }}>
          {([
            "STATS",
            ...(asset.hasLiveStats ? ["STRAND"] : []),
            // Skaters get the measured EDGE/sim-driver tab (the shot map inside
            // no-ops for players without a numeric NHL id).
            ...(asset.position !== "G" && asset.position !== "Pick" ? ["EDGE"] : []),
            ...(gravProfile ? ["GRAVITY"] : []),
            ...(hasOutlook ? ["OUTLOOK"] : []),
            "TIMELINE",
          ] as AssetCardView[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className="flex items-center gap-1 text-2xs font-black uppercase tracking-widest px-3 py-1.5 transition-all"
              style={{
                color: view === v ? 'var(--ledger-ink)' : 'var(--ledger-ink-faint)',
                borderBottom: view === v ? '2px solid #1c140a' : '2px solid transparent',
                marginBottom: '-1px',
                background: 'transparent',
              }}>
              {v === "STRAND" ? (
                <>
               
                  <svg width="14" height="10" viewBox="0 0 14 10" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                    <path d="M0,2 C2,2 2,8 4,8 C6,8 6,2 8,2 C10,2 10,8 12,8 C14,8 14,2 14,2"
                      fill="none" stroke={view === "STRAND" ? "var(--ledger-ice)" : "var(--ledger-ink-faint)"} strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M0,8 C2,8 2,2 4,2 C6,2 6,8 8,8 C10,8 10,2 12,2 C14,2 14,8 14,8"
                      fill="none" stroke={view === "STRAND" ? "var(--ledger-red)" : "var(--ledger-rule-mid)"} strokeWidth="1.5" strokeLinecap="round"/>
                    {[2, 5, 8, 11].map(x => (
                      <line key={x} x1={x} y1={2} x2={x} y2={8}
                        stroke={view === "STRAND" ? "var(--ledger-ink-faint)" : "var(--ledger-rule-mid)"} strokeWidth="0.8" opacity="0.6"/>
                    ))}
                  </svg>
                  STRAND
                </>
              ) : v}
            </button>
          ))}
        </div>
      )}

      {/* STRAND — Stylistic Trait & Rating Analysis for NHL Development */}
      {view === "STRAND" && !isPick && (
        <>
          {otherBlock.length > 0 && (
            <div className="flex items-center gap-2 mb-1.5 px-0.5">
              <span className="text-2xs font-black uppercase tracking-wider shrink-0 text-ledger-ink-faint font-mono">
                Compare vs
              </span>
              <select
                value={compareId}
                onChange={e => setCompareId(e.target.value)}
                className="text-2xs font-black flex-1 py-0.5 px-1 appearance-none"
                style={{ background: 'var(--ledger-cream)', border: '1px solid #c8b890', color: 'var(--ledger-ink)', borderRadius: '1px' }}
              >
                <option value="">— none —</option>
                {otherBlock.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({displayPosition(a.position, a.secondaryPosition)})</option>
                ))}
              </select>
            </div>
          )}
          <StrandView
            asset={asset}
            xnav={xnav}
            compareAsset={compareAsset}
            compareXnav={compareXnav}
          />
        </>
      )}
      {view === "EDGE" && !isPick && (
        <div className="py-1">
          <MeasuredProfile asset={asset} />
          <EdgeShotMap nhlPlayerId={asset.id} />
        </div>
      )}
      {view === "TIMELINE" && !isPick && (
        <div className="py-1">
                    <PlayerTimeline asset={asset as any} /> 
        </div>
      )}
      {view === "GRAVITY" && gravProfile && (
        <GravityField profile={gravProfile} playerName={asset.name} />
      )}
      {view === "OUTLOOK" && hasOutlook && (
        <PlayerOutlook asset={asset} />
      )}
      {/* Standard STATS view */}
      {(view === "STATS" || isPick) && (<>
      {asset.position === "G" && !isPick && (
        <div className="grid grid-cols-3 gap-1.5 mb-2.5 sm:grid-cols-3">
          {[
            { label: 'GSAx', val: (asset.gsax??0).toFixed(1), good: (asset.gsax??0) >= 0 },
            { label: 'SV%',  val: ((asset.savePct??0.9)*100).toFixed(1), good: (asset.savePct??0) >= 0.910 },
            { label: 'GP',   val: String(asset.gamesStarted ?? 0), good: true },
          ].map(s => (
            <div key={s.label} className="p-2 text-center">
              <div className="text-2xs font-black uppercase tracking-tight mb-0.5">{s.label}</div>
              <div className="text-[11px] font-black" style={{ color: s.good ? 'var(--ledger-green)' : 'var(--ledger-red)' }}>{s.val}</div>
            </div>
          ))}
          {/* Role badge */}
          <div className="col-span-3 px-2 py-1 flex justify-between items-center">
            {(() => {
              const gp = asset.gamesStarted ?? asset.games ?? 0;
              const isBackup  = gp < 33;
              const isStarter = gp >= 40;
              return (
                <span className="text-2xs px-1 py-0.5 font-black" style={{
                  color: isStarter ? 'var(--ledger-ice)' : isBackup ? 'var(--ledger-amber-dark)' : 'var(--ledger-brown)',
                  border: `1px solid ${isStarter ? 'rgba(26,46,92,0.4)' : isBackup ? 'rgba(154,107,0,0.4)' : 'rgba(107,80,48,0.4)'}`,
                }} title={isBackup ? "Backup goalie — NAV capped at 55. Per-game rates on <25 starts are unreliable predictors of full-season value." : isStarter ? "Starter — played 35+ games, full valuation applied" : "Tandem — shared starter role"}>
                  {isBackup ? "BACKUP" : isStarter ? "STARTER" : "TANDEM"}
                </span>
              );
            })()}
            {pedigree?.careerGsax && (
              <span className="text-2xs font-black text-ledger-ice font-mono">
                +{pedigree.careerGsax} career · Peak {pedigree.peakGsax}
              </span>
            )}
          </div>
        </div>
      )}

      {/* SKATER NAV breakdown bars */}
      {!isPick && asset.position !== "G" && (
        <div className="mb-2.5">
          {/* Point Shares — shown when available */}
          {(asset.ops != null || asset.dps != null) && (
            <div className="flex gap-1.5 mb-1.5">
              {asset.ops != null && (
                <div className="flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(26,46,92,0.08)', border: '1px solid rgba(26,46,92,0.2)', borderRadius: '2px' }}>
                  <span className="text-2xs font-black uppercase tracking-wider text-ledger-ink-faint font-mono">OPS</span>
                  <span className="text-2xs font-black text-ledger-ice font-mono">{asset.ops.toFixed(1)}</span>
                </div>
              )}
              {asset.dps != null && (
                <div className="flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(184,48,32,0.08)', border: '1px solid rgba(184,48,32,0.2)', borderRadius: '2px' }}>
                  <span className="text-2xs font-black uppercase tracking-wider text-ledger-ink-faint font-mono">DPS</span>
                  <span className="text-2xs font-black" style={{ color: 'var(--ledger-red)' }}>{asset.dps.toFixed(1)}</span>
                </div>
              )}
              {asset.ops != null && asset.dps != null && (asset.ops + asset.dps) > 0 && (
                <div className="flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(107,80,48,0.08)', border: '1px solid rgba(107,80,48,0.2)', borderRadius: '2px' }}>
                  <span className="text-2xs font-black uppercase tracking-wider text-ledger-ink-faint font-mono">PS</span>
                  <span className="text-2xs font-black" style={{ color: 'var(--ledger-brown)' }}>{(asset.ops + asset.dps).toFixed(1)}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-2xs font-black uppercase tracking-wider text-ledger-ink-faint font-mono"
              title="X-NAV — Extended Net Asset Value, the player’s tradeable value">NAV Breakdown</span>
            <span
              className="text-2xs font-black rounded-full w-4 h-4 flex items-center justify-center cursor-help shrink-0"
              style={{ color: 'var(--ledger-ink-faint)', border: '1px solid #c8b890' }}
              title="OFF: Offensive production value (pts/82 pace, xG). DEF: Defensive suppression (xG against, TOI quality). YNG: Option value from proven youth on cheap deal. CAP: Contract cost penalty — overpaid contracts drag total NAV."
            >i</span>
          </div>
          <div className="stat-grid-4">
            <MicroBar 
    label="OFF" 
    val={xnav.off} 
    max={HISTORICAL_MAX_OFF} // Updated to Lemieux's 300 scale
    color="cyan"
    tooltip="Offensive impact — scoring production (pts/82, xG rate)" 
/>
            <MicroBar
    label="DEF"
    val={displayedDef}
    // Now that the scales are mathematically synced, the max is 148 either way
    max={HISTORICAL_MAX_DEF}
    color="emerald"
    tooltip={asset.dps != null
    ? `Defensive Point Shares: ${asset.dps.toFixed(1)} — hockey-reference defensive contribution metric`
    : "Defensive value — xG suppression weighted by ice time quality"
    } 
/>
            <MicroBar label={xnav.age > 0 ? "YNG" : "AGE"} val={xnav.age} max={80}
              color={xnav.age > 0 ? "emerald" : "amber"}
              tooltip={xnav.age > 0
                ? "Youth premium — proven production on a cheap contract creates surplus value"
                : "Age penalty — decline curve discount for veterans past peak age"} />
            <MicroBar label="CAP" val={xnav.cap} max={100} color="rose" invert
              tooltip="Contract cost — overpaid contracts drag total NAV. Negative = cap hit exceeds on-ice value" />
            {Math.abs(floorAdj) >= 1 && (
              <MicroBar label="FLOOR" val={floorAdj} max={100} color="amber"
                tooltip="Franchise/career floor applied" />
            )}
          </div>
          {/* Career peak — real best NHL season (from history) so a stale
              curated pedigree value can't understate it (Scheifele: 103, not 88). */}
          {(() => {
            const realPeak = asset.developmentProfile?.careerPeakPts82 ?? 0;
            const peak = Math.max(realPeak, pedigree?.peakPtsPace ?? 0);
            if (peak <= 0) return null;
            return (
              <div className="mt-1.5 px-1 py-1 flex justify-between items-center" style={{ borderTop: '1px solid #c8b890' }}>
                <span className="text-2xs font-black uppercase tracking-tight text-ledger-ink-faint font-mono">Career Peak</span>
                <span className="text-2xs font-black text-ledger-ice font-mono">
                  {peak} pts/82
                </span>
              </div>
            );
          })()}
          {gravProfile && (
            <div className="mt-1 px-1 py-1 flex justify-between items-center" style={{ borderTop: '1px solid #c8b890' }}>
              <span className="text-2xs font-black uppercase tracking-tight text-ledger-ink-faint font-mono">Gravity</span>
              <CompactGravity profile={gravProfile} />
            </div>
          )}
        </div>
      )}

      {/* Goalie G-NAV + CAP bars */}
      {!isPick && asset.position === "G" && (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span>G-NAV Breakdown</span>
            <span
              className="text-2xs font-black rounded-full w-4 h-4 flex items-center justify-center cursor-help shrink-0 badge-rule"
              title="G-NAV: Goals Saved Above Expected (GSAx) — how many goals this goalie prevented vs an average starter. CAP: Contract cost penalty."
            >i</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <MicroBar label="G-NAV" val={xnav.def} max={300} color="emerald"
              tooltip="Goalie NAV — based on GSAx (goals saved above expected) from MoneyPuck" />
            <MicroBar label="CAP" val={xnav.cap} max={100} color="rose" invert
              tooltip="Contract cost — overpaid contracts drag total NAV" />
          </div>
        </div>
      )}

      {/* ── Player stat line (skaters only) ───────────────────── */}
      {!isPick && asset.position !== "G" && asset.hasLiveStats && (
        <div className="mt-2 pt-2" style={{ borderTop: '1px solid #c8b890' }}>
          {/* Box score row — PTS is G + A so a thin sample can't show 0-0-1 */}
          <div className="stat-grid-4 mb-1.5">
            {(() => {
              const box = boxScoreFromPace(asset);
              return [
                { label: 'GP',  val: String(box.gp) },
                { label: 'G',   val: String(box.g) },
                { label: 'A',   val: String(box.a) },
                { label: 'PTS', val: String(box.pts) },
              ];
            })().map(s => (
              <div key={s.label} className="text-center p-1" style={{ background: 'var(--ledger-cream)', border: '1px solid #b8a070' }}>
                <div className="text-2xs font-black uppercase tracking-tight text-ledger-ink-faint font-mono">{s.label}</div>
                <div className="text-[11px] font-black text-ledger-ink font-mono">{s.val}</div>
              </div>
            ))}
          </div>
          {/* Advanced row */}
          <div className="stat-grid-4">
            {[
              { label: 'TOI',   val: asset.avgTOI?.toFixed(1) ?? '—',   tooltip: 'Average time on ice per game (minutes)' },
              { label: 'xG/82', val: asset.xGPace?.toFixed(1)  ?? '—',  tooltip: 'Expected goals generated per 82 games' },
              { label: 'xG%+', val: asset.xgRelTM != null ? `${(asset.xgRelTM as number) > 0 ? '+' : ''}${(asset.xgRelTM as number).toFixed(1)}` : '—', tooltip: 'xG% relative to teammates — positive means team controls more shots when this player is on ice vs off' },
              { label: 'QoC',   val: asset.qocIndex != null ? asset.qocIndex.toString() : '—',  tooltip: 'Deployment difficulty 0-100: per-game ice-time rank + PK share + d-zone starts. 75+ shutdown/top-pair, ~40 middle six, <20 sheltered' },
            ].map(s => (
              <div key={s.label} className="text-center p-1" title={s.tooltip} style={{ background: 'var(--ledger-warm)', border: '1px solid #b8a070' }}>
                <div className="text-2xs font-black uppercase tracking-tight text-ledger-ink-faint font-mono">{s.label}</div>
                <div className="text-2xs font-black text-ledger-ice font-mono">{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retention controls (only for eligible players) */}
      {asset.canRetain && !isPick && (
        <div className="mt-2 border-t border-zinc-800/50 pt-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-2xs text-zinc-600 font-black uppercase tracking-wider">Salary Retention</span>
            <span className="text-2xs font-mono text-zinc-400 font-black">
              {retentionPct}% (${(asset.capHit * (asset.retainedPct || 0)).toFixed(2)}M)
            </span>
          </div>
          <div className="grid grid-cols-[auto_1fr_auto] gap-1.5">
            <button
              type="button"
              onClick={() => setRetentionPct(retentionPct - 5)}
              disabled={retentionPct <= 0}
              className="h-9 w-9 border border-zinc-700 bg-zinc-900 text-zinc-200 font-black disabled:opacity-30"
              aria-label="Decrease salary retention by 5 percent">
              -
            </button>
            <div className="grid grid-cols-3 gap-1.5">
              {[0, 25, 50].map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setRetentionPct(pct)}
                  className="h-9 border font-black text-2xs uppercase tracking-wider"
                  style={{
                    borderColor: retentionPct === pct ? 'var(--ledger-green)' : '#3f3f46',
                    background: retentionPct === pct ? 'rgba(36,94,57,0.18)' : '#18181b',
                    color: retentionPct === pct ? 'var(--ledger-green)' : '#d4d4d8',
                  }}>
                  {pct === 50 ? "50 Max" : `${pct}%`}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRetentionPct(retentionPct + 5)}
              disabled={retentionPct >= 50}
              className="h-9 w-9 border border-zinc-700 bg-zinc-900 text-zinc-200 font-black disabled:opacity-30"
              aria-label="Increase salary retention by 5 percent">
              +
            </button>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden bg-zinc-900 border border-zinc-700">
            <div
              className="h-full transition-all"
              style={{
                width: `${retentionPct * 2}%`,
                background: 'var(--ledger-green)',
              }}
            />
          </div>
        </div>
      )}

      {/* Pick protection toggle */}
      {isPick && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-2xs text-zinc-600 font-black uppercase tracking-wider">Protected</span>
          <button
            onClick={() => updateAsset({ isProtected: !asset.isProtected })}
            className={`text-2xs font-black px-2 py-0.5 rounded border transition-colors ${
              asset.isProtected
                ? "bg-amber-900/30 border-amber-800/50 text-amber-400"
                : "bg-zinc-800 border-zinc-700 text-zinc-500"
            }`}
          >
            {asset.isProtected ? "Protected ↓" : "Unprotected"}
          </button>
        </div>
      )}
      {/* Close STATS view wrapper */}
      </>)}
    </div>
  );
}




// ============================================================
// MICRO COMPONENTS
// ============================================================

function StatItem({ val, pct, label, good, invert, note }: { val: string; pct: number; label: string; good?: boolean; invert?: boolean; note?: string }) {
  // same color logic...
  const color = good === undefined
    ? 'var(--ledger-ice)'
    : good ? (invert ? 'var(--ledger-amber)' : 'var(--ledger-green)') : (invert ? 'var(--ledger-green)' : 'var(--ledger-red)');
  
  return (
    <div className="flex justify-between items-center group relative cursor-help">
      <span className="text-2xs font-black uppercase tracking-widest text-ledger-ink-faint">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold" style={{ color }}>{val}</span>
        <div className="w-12 h-1 rounded-full overflow-hidden shrink-0" style={{ background: 'var(--ledger-rule-light)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
      {note && (
        <div className="absolute right-0 bottom-full mb-1 w-48 p-2 bg-ledger-cream border border-ledger-rule shadow-sm 
                        text-2xs text-ledger-ink-faint font-medium rounded opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
          {note}
        </div>
      )}
    </div>
  );
}
