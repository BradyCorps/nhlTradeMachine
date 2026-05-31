"use client";
// ── TradePanel — one side of the trade machine ────────────────
import React, { Suspense } from "react";
import type { Asset, Team, XNAVResult } from "@/app/lib/trade-types";
import AssetCard from "@/app/components/AssetCard";
import AssetDropdown from "@/app/components/AssetDropdown";
import LedgerDropdown from "@/app/components/LedgerDropdown";

function TradePanel({
  idx, team, nav, capSpace, db, blocks, setTeams, setBlocks, label, accent, navMap, locked, onRequestTrade, onRequestBlockTrade
}: {
  idx: 0 | 1;
  team: Team | null;
  nav: number;
  capSpace: number;
  db: { teams: Team[]; players: Asset[] };
  blocks: [Asset[], Asset[]];
  setTeams: React.Dispatch<React.SetStateAction<[Team | null, Team | null]>>;
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
  label: string;
  accent: string;
  navMap: Record<string, XNAVResult>;
  locked?: boolean;
  onRequestTrade?: (a: Asset) => void;
  onRequestBlockTrade?: (block: Asset[]) => void;
}) {
  const isLeft = idx === 0;

  return (
    <div className="relative border rounded-2xl p-4 lg:p-6 flex flex-col min-h-[400px] lg:min-h-[1rem]" style={{
      background: 'var(--ledger-card-light)',
      borderColor: isLeft ? 'var(--ledger-ink-faint)' : 'var(--ledger-rule)',
    }}>
      {/* Badge */}
      <div className={`absolute -top-3 left-6 px-3 py-1 text-2xs font-black uppercase tracking-[0.3em] border`} style={{
        background: 'var(--ledger-warm)',
        borderColor: 'var(--ledger-rule)',
        color: 'var(--ledger-brown)',
        borderRadius: '2px'
      }}>
        {accent}
      </div>

      {/* Section dateline */}
      <div className="mb-4 pb-3">
        <div className="text-2xs font-black uppercase tracking-[0.5em] mb-1">
          {label}
        </div>
        <div className="flex justify-between items-end gap-3">
          {locked && idx === 0 ? (
            <div className="flex items-center gap-2 flex-1">
              <span className="font-black text-[15px] text-ledger-ink font-serif">
                {team?.name}
              </span>
              <span className="text-2xs font-black px-1.5 py-0.5" style={{
                color: 'var(--ledger-red)', border: '1px solid rgba(184,48,32,0.4)',
              }}>LOCKED</span>
            </div>
          ) : (
          <Suspense fallback={<div className="h-8 w-48 animate-pulse bg-ledger-card rounded" />}>
          <LedgerDropdown
            teams={db.teams}
            selectedId={team?.id ?? ""}
            onSelect={(id: string) => {
              const found = db.teams.find((t) => t.id === id) ?? null;
              setTeams((prev) => { const n = [...prev] as [Team | null, Team | null]; n[idx] = found; return n; });
              setBlocks((prev) => { const n = [...prev] as [Asset[], Asset[]]; n[idx] = []; return n; });
            }}
          />
          </Suspense>
          )}

          <div className="text-right shrink-0 ml-3">
            <div className="font-black leading-none" style={{ fontSize: '1.4rem', color: 'var(--ledger-ink)', fontStyle: 'italic' }}>
              {nav.toFixed(1)}
            </div>
            <div className="text-2xs font-black uppercase tracking-widest">NAV</div>
            <div className="text-2xs font-black px-1.5 py-0.5 mt-0.5" style={{
              color: capSpace < 0 ? 'var(--ledger-red)' : 'var(--ledger-green)',
              background: capSpace < 0 ? 'rgba(184,48,32,0.08)' : 'rgba(26,92,46,0.08)',
              border: `1px solid ${capSpace < 0 ? 'rgba(184,48,32,0.25)' : 'rgba(26,92,46,0.25)'}`,
            }}>
              {capSpace >= 0 ? `+${capSpace.toFixed(1)}M` : `${capSpace.toFixed(1)}M`}
            </div>
          </div>
        </div>
      </div>

      {/* Asset list */}
      <div className="flex-grow overflow-y-auto space-y-2 mb-4 pr-1">
        {!team && idx === 1 && (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div style={{ fontSize: "11px", color: "var(--ledger-ink-faint)", textAlign: "center", letterSpacing: "0.2em", textTransform: "uppercase" }}>
              Select a trade partner<br/>above to begin
            </div>
            <div style={{ color: "var(--ledger-rule-mid)", fontSize: "24px" }}>⇄</div>
          </div>
        )}
        {blocks[idx].length === 0 && team && (
          <div className="flex items-center justify-center h-32 border-2 border-dashed" >
            <span className="text-2xs font-black uppercase tracking-[0.3em]">No assets on the block</span>
          </div>
        )}
        {blocks[idx].map((a) => (
          <AssetCard
            key={a.id}
            asset={a}
            idx={idx}
            blocks={blocks}
            setBlocks={setBlocks}
            onRequestTrade={onRequestTrade}
            navResult={navMap[a.id]}
            navMap={navMap}
          />
        ))}
      </div>

      {/* Find Trade Partners button — only on outgoing (home) side with assets */}
      {idx === 0 && blocks[0].length > 0 && onRequestBlockTrade && (
        <button
          onClick={() => onRequestBlockTrade(blocks[0])}
          className="w-full py-2.5 font-black text-2xs uppercase tracking-widest transition-all mb-2 flex items-center justify-center gap-2 btn-ink"
        >
          ⚡ Find Trade Partners for This Package
        </button>
      )}

      {/* Asset selector */}
      <AssetDropdown idx={idx} team={team} db={db} blocks={blocks} setBlocks={setBlocks} navMap={navMap} />
    </div>
  );
}


export default TradePanel;