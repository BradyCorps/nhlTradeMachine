import React from "react";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import { PLAYER_PEDIGREE, INJURY_RISK, PROSPECT_TIERS, SHUTDOWN_D_PEDIGREE } from "@/app/lib/player-data";

export function AssetBadges({ asset, xnav }: { asset: Asset; xnav: XNAVResult }) {
  const isPick = asset.position === "Pick";

  return (
    <div className="asset-badges flex flex-wrap gap-1 mt-1">
      {/* Awards badges */}
      {PLAYER_PEDIGREE[asset.name]?.awards && PLAYER_PEDIGREE[asset.name].awards!.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Array.from(new Set(PLAYER_PEDIGREE[asset.name].awards)).map((award) => {
            const count = PLAYER_PEDIGREE[asset.name].awards!.filter(a => a === award).length;
            return (
              <span key={award} className="text-2xs px-1 py-0.5 font-black" style={{ color: 'var(--ledger-amber)', border: '1px solid rgba(138,92,0,0.4)' }}>
                {count > 1 ? `${count}× ` : ""}{award}
              </span>
            );
          })}
        </div>
      )}
      
      {/* Prospect tier badge */}
      {PROSPECT_TIERS[asset.name] && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: PROSPECT_TIERS[asset.name].tier === 1 ? 'var(--ledger-navy)' : PROSPECT_TIERS[asset.name].tier === 2 ? 'var(--ledger-green)' : 'var(--ledger-brown)',
          border: `1px solid ${PROSPECT_TIERS[asset.name].tier === 1 ? 'rgba(26,46,92,0.4)' : PROSPECT_TIERS[asset.name].tier === 2 ? 'rgba(26,92,46,0.4)' : 'rgba(107,80,48,0.4)'}`,
        }}>
          {PROSPECT_TIERS[asset.name].tier === 1 ? "★ FRANCHISE" : PROSPECT_TIERS[asset.name].tier === 2 ? "◆ TOP PROSPECT" : "◇ PROSPECT"}
        </span>
      )}
      
      {/* Injury risk badge */}
      {INJURY_RISK[asset.name] && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: 'var(--ledger-red)',
          border: '1px solid rgba(184,48,32,0.4)'
        }} title={INJURY_RISK[asset.name].note}>
          ⚕ {INJURY_RISK[asset.name].level} RISK
        </span>
      )}

      {/* D-man archetype badge */}
      {asset.position === "D" && !isPick && (() => {
        const pts = asset.ptsPace ?? 0;
        const toi = asset.avgTOI ?? 0;
        const qoc = asset.qocRank ?? 450;
        let arch = "DEPTH D";
        let color = 'var(--ledger-brown)';
        let title = "5th/6th defender — limited deployment";
        if (pts >= 45) {
          arch = "OFFENSIVE D"; color = 'var(--ledger-navy)';
          title = "Offensive defenceman — primary value from scoring and powerplay";
        } else if (pts >= 28 && toi >= 21) {
          arch = "TWO-WAY D"; color = 'var(--ledger-green)';
          title = "Two-way defenceman — contributes offensively and defensively";
        } else if (pts < 28 && toi >= 19 && qoc < 220) {
          arch = "SHUTDOWN D"; color = 'var(--ledger-amber)';
          title = `Shutdown defenceman — faces elite competition (QoC rank: ${qoc}), valued for defensive role not scoring`;
        }
        return (
          <span className="text-2xs px-1 py-0.5 font-black" style={{
            color, border: `1px solid ${color}40`
          }} title={title}>
            {arch}
          </span>
        );
      })()}

      {/* Forward archetype badge */}
      {["C","W","L","R"].includes(asset.position) && !isPick && xnav.fArchetype && (() => {
        const archMap: Record<string, { color: string; title: string }> = {
          FRANCHISE:  { color: 'var(--ledger-ink)', title: "Franchise — elite production with dominant creative or NOIV impact" },
          SNIPER:     { color: 'var(--ledger-navy)', title: "Sniper — goal-first scorer, goal ratio > 53% of points" },
          PLAYMAKER:  { color: 'var(--ledger-green)', title: "Playmaker — primary value from assist generation and play-driving" },
          TWO_WAY:    { color: 'var(--ledger-amber)', title: "Two-Way Forward — balanced offense with strong defensive suppression" },
          GRINDER:    { color: 'var(--ledger-red)', title: "Grinder — defensive deployment, physical play, limited offensive upside" },
          SCORER:     { color: 'var(--ledger-navy)', title: "Scoring Forward — balanced offensive production" },
        };
        const cfg = archMap[xnav.fArchetype];
        if (!cfg) return null;
        return (
          <span className="text-2xs px-1 py-0.5 font-black" style={{
            color: cfg.color,
            border: `1px solid ${cfg.color}40`,
          }} title={cfg.title}>
            {xnav.fArchetype.replace("_", " ")}
          </span>
        );
      })()}

      {/* Change of scenery badge — negative NAV players that might thrive elsewhere */}
      {!isPick && xnav.total < -5 && xnav.total > -40 && asset.age <= 32 && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: 'var(--ledger-gold)',
          border: '1px solid rgba(148,105,20,0.45)',
        }} title="Negative NAV on current team — may suit a different system or situation. Teams with cap space and the right roster need sometimes absorb these contracts for picks.">
          ⟳ CHANGE OF SCENERY
        </span>
      )}

      {/* Salary dump badge — deeply negative, hard to move */}
      {!isPick && xnav.total <= -40 && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: 'var(--ledger-red)',
          border: '1px solid rgba(184,48,32,0.45)',
        }} title="Deeply negative contract — moving this requires significant salary retention or picks sweetener.">
          ⚠ SALARY DUMP
        </span>
      )}

      {/* Surplus contract stamp */}
      {!isPick && (() => {
        const effectiveCap = asset.capHit * (1 - (asset.retainedPct || 0));
        const isSurplus = xnav.total > effectiveCap * 18 && xnav.total > 50;
        if (!isSurplus) return null;
        return (
          <span className="text-2xs px-1 py-0.5 font-black" style={{
            color: 'var(--ledger-green)',
            border: '1px solid rgba(26,92,46,0.5)',
          }} title="Surplus contract — this player's on-ice value significantly exceeds their cap hit.">
            ★ SURPLUS CONTRACT
          </span>
        );
      })()}

      {/* Shutdown D pedigree badge */}
      {SHUTDOWN_D_PEDIGREE[asset.name] && (
        <span className="text-2xs px-1 py-0.5 font-black" style={{
          color: 'var(--ledger-amber)',
          border: '1px solid rgba(138,92,0,0.5)'
        }} title={SHUTDOWN_D_PEDIGREE[asset.name].note}>
          ★ ELITE SHUTDOWN
        </span>
      )}
    </div>
  );
}
