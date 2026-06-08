"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Asset, Team } from "@/app/lib/trade-types";
import { useTradeStore } from "@/app/store/tradeStore";

const CORE_COUNT = 8;

function isProspect(p: Asset): boolean {
  if (p.position === "Pick") return false;
  return p.age <= 23 && ((p.games ?? 0) < 50 || p.capHit <= 0.925);
}

function navColor(n: number): string {
  if (n >= 200) return "var(--ledger-green)";
  if (n >= 100) return "var(--ledger-navy)";
  if (n >= 50)  return "var(--ledger-amber)";
  if (n > 0)    return "var(--ledger-ink-faint)";
  return "var(--ledger-red)";
}

function PlayerRow({ p, nav, onClick }: { p: Asset; nav: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors"
      style={{ borderBottom: "1px solid var(--ledger-rule-light)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--ledger-cream)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[8px] font-black w-5 shrink-0 font-mono"
          style={{ color: "var(--ledger-ink-faint)" }}>
          {p.position}
        </span>
        <span className="text-[11px] font-bold truncate"
          style={{ color: "var(--ledger-ink)" }}>
          {p.name}
        </span>
        <span className="text-[9px] shrink-0 font-mono"
          style={{ color: "var(--ledger-ink-faint)" }}>
          {p.age}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-2 font-mono">
        <span className="text-[10px]" style={{ color: "var(--ledger-ink-faint)" }}>
          ${p.capHit.toFixed(2)}M
        </span>
        <span className="text-[10px] font-black w-10 text-right" style={{ color: navColor(nav) }}>
          {nav > 0 ? "+" : ""}{nav.toFixed(0)}
        </span>
      </div>
    </button>
  );
}

function SectionHead({ label, count, icon }: { label: string; count: number; icon: string }) {
  return (
    <div className="px-3 py-1.5 flex items-center justify-between sticky top-0"
      style={{ background: "var(--ledger-card)", borderBottom: "1px solid var(--ledger-rule)", borderTop: "1px solid var(--ledger-rule)" }}>
      <span className="text-[8px] font-black uppercase tracking-[0.25em] font-mono"
        style={{ color: "var(--ledger-ink-faint)" }}>
        {icon} {label}
      </span>
      <span className="text-[8px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
        {count}
      </span>
    </div>
  );
}

function AssetDropdown({
  idx, team, db,
}: {
  idx:  0 | 1;
  team: Team | null;
  db:   { teams: Team[]; players: Asset[] };
}) {
  const blocks   = useTradeStore(s => s.blocks);
  const navMap   = useTradeStore(s => s.navMap);
  const addAsset = useTradeStore(s => s.addAsset);

  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const label = idx === 0 ? "+ Add Outgoing Asset" : "+ Request Incoming Asset";

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 60);
    else setSearch("");
  }, [open]);

  const eligible = useMemo(() =>
    db.players.filter(p =>
      p.teamId === team?.id &&
      !blocks[idx].some((a: Asset) => a.id === p.id)
    ),
    [db.players, team?.id, blocks, idx]
  );

  const { core, depth, prospects, picks } = useMemo(() => {
    const q        = search.toLowerCase();
    const filtered = q ? eligible.filter(p => p.name.toLowerCase().includes(q)) : eligible;
    const byNav    = (a: Asset, b: Asset) => (navMap[b.id]?.total ?? 0) - (navMap[a.id]?.total ?? 0);

    const skaters     = filtered.filter(p => p.position !== "Pick");
    const nonProspect = skaters.filter(p => !isProspect(p)).sort(byNav);

    return {
      core:      nonProspect.slice(0, CORE_COUNT),
      depth:     nonProspect.slice(CORE_COUNT),
      prospects: skaters.filter(isProspect).sort(byNav),
      picks:     filtered.filter(p => p.position === "Pick"),
    };
  }, [eligible, navMap, search]);

  const handleAdd = (p: Asset) => {
    addAsset({ ...p, retainedPct: 0 }, idx);
    setOpen(false);
  };

  if (!team) return null;

  const total = core.length + depth.length + prospects.length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-center border p-3.5 font-black uppercase tracking-widest text-2xs outline-none cursor-pointer transition-colors hover:opacity-80"
        style={{
          background:  "var(--ledger-warm)",
          borderColor: "var(--ledger-rule)",
          color:       "var(--ledger-brown)",
          borderRadius: "12px",
        }}
      >
        {label}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex flex-col font-mono"
            style={{
              background:  "var(--ledger-warm)",
              border:      "1px solid var(--ledger-rule)",
              width:       "100%",
              maxWidth:    440,
              maxHeight:   "82vh",
              boxShadow:   "0 16px 48px rgba(0,0,0,0.45)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between shrink-0"
              style={{ borderBottom: "2px double var(--ledger-ink)" }}>
              <div>
                <div className="text-[9px] uppercase tracking-[0.35em] font-mono mb-0.5"
                  style={{ color: "var(--ledger-ink-faint)" }}>
                  {idx === 0 ? "Outgoing" : "Incoming"} · {team.name}
                </div>
                <div className="text-[13px] font-black" style={{ color: "var(--ledger-ink)" }}>
                  Select Asset
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                className="text-[11px] px-2 py-1 hover:opacity-60 transition-opacity"
                style={{ color: "var(--ledger-ink-faint)" }}>
                ✕
              </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 shrink-0"
              style={{ borderBottom: "1px solid var(--ledger-rule)" }}>
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name…"
                className="w-full text-[11px] font-mono outline-none"
                style={{
                  background:   "transparent",
                  color:        "var(--ledger-ink)",
                  borderBottom: "1px solid var(--ledger-rule)",
                  padding:      "4px 2px",
                }}
              />
            </div>

            {/* Scrollable list */}
            <div className="overflow-y-auto" style={{ flex: 1, minHeight: 0 }}>

              {core.length > 0 && (
                <>
                  <SectionHead label="Core Players" count={core.length} icon="◆" />
                  {core.map(p => (
                    <PlayerRow key={p.id} p={p} nav={navMap[p.id]?.total ?? 0} onClick={() => handleAdd(p)} />
                  ))}
                </>
              )}

              {depth.length > 0 && (
                <>
                  <SectionHead label="Depth Players" count={depth.length} icon="◇" />
                  {depth.map(p => (
                    <PlayerRow key={p.id} p={p} nav={navMap[p.id]?.total ?? 0} onClick={() => handleAdd(p)} />
                  ))}
                </>
              )}

              {prospects.length > 0 && (
                <>
                  <SectionHead label="Prospects & ELC" count={prospects.length} icon="↑" />
                  {prospects.map(p => (
                    <PlayerRow key={p.id} p={p} nav={navMap[p.id]?.total ?? 0} onClick={() => handleAdd(p)} />
                  ))}
                </>
              )}

              {picks.length > 0 && (
                <>
                  <SectionHead label="Draft Picks" count={picks.length} icon="⬡" />
                  {picks.map(p => (
                    <PlayerRow key={p.id} p={p} nav={navMap[p.id]?.total ?? 0} onClick={() => handleAdd(p)} />
                  ))}
                </>
              )}

              {total === 0 && picks.length === 0 && (
                <div className="px-4 py-8 text-center text-[10px] uppercase tracking-[0.2em]"
                  style={{ color: "var(--ledger-ink-faint)" }}>
                  {search ? "No players match" : "No available assets"}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-1.5 text-[8px] font-mono text-center shrink-0"
              style={{ borderTop: "1px solid var(--ledger-rule)", color: "var(--ledger-ink-faint)" }}>
              {total} players · {picks.length} picks — click to add
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default AssetDropdown;
