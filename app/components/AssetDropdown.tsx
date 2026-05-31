"use client";
// ── AssetDropdown — search + select player from a team roster ─
import React from "react";
import type { Asset, Team, XNAVResult } from "@/app/lib/trade-types";

function AssetDropdown({
  idx, team, db, blocks, setBlocks, navMap
}: {
  idx: 0 | 1;
  team: Team | null;
  db: { teams: Team[]; players: Asset[] };
  blocks: [Asset[], Asset[]];
  setBlocks: React.Dispatch<React.SetStateAction<[Asset[], Asset[]]>>;
  navMap: Record<string, XNAVResult>;
}) {
  const label = idx === 0 ? "+ ADD OUTGOING ASSET" : "+ REQUEST INCOMING ASSET";

  const eligible = db.players
    .filter((p) => p.teamId === team?.id && !blocks[idx].some((a: Asset) => a.id === p.id))
    .sort((a, b) => {
      const navA = navMap[a.id]?.total ?? 0;
      const navB = navMap[b.id]?.total ?? 0;
      return navB - navA;
    });

  const skaters = eligible.filter((p) => p.position !== "Pick");
  const picks = eligible.filter((p) => p.position === "Pick");

  return (
    <select
      className="w-full border p-3.5 rounded-xl font-black uppercase tracking-widest text-2xs outline-none appearance-none cursor-pointer transition-colors"
      style={{ background: 'var(--ledger-warm)', borderColor: 'var(--ledger-rule)', color: 'var(--ledger-brown)' }}
      onChange={(e) => {
        const asset = db.players.find((p) => p.id === e.target.value);
        if (asset) {
          setBlocks((prev) => {
            const n = [...prev] as [Asset[], Asset[]];
            n[idx] = [...n[idx], { ...asset, retainedPct: 0 }];
            return n;
          });
        }
        e.target.value = "";
      }}
      defaultValue=""
    >
      <option value="" disabled>{label}</option>
      {skaters.length > 0 && (
        <optgroup label="── SKATERS ──">
          {skaters.map((p) => (
            <option key={p.id} value={p.id} className="bg-zinc-900 text-sm">
              {p.name} [{p.position}] ${p.capHit.toFixed(1)}M — NAV {(navMap[p.id]?.total ?? 0).toFixed(0)}
            </option>
          ))}
        </optgroup>
      )}
      {picks.length > 0 && (
        <optgroup label="── DRAFT PICKS ──">
          {picks.map((p) => (
            <option key={p.id} value={p.id} className="bg-zinc-900 text-sm">
              {p.name} — NAV {(navMap[p.id]?.total ?? 0).toFixed(0)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}


export default AssetDropdown;