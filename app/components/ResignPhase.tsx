"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Asset, Team } from "@/app/lib/trade-types";
import type { OffseasonPending } from "@/app/lib/free-agency";
import { getOfferSheetCompensation } from "@/app/lib/free-agency";

// ── Off-Season Re-Sign phase ──────────────────────────────────────────────
// Presentational only: the page owns the roster/cap state and passes handlers.
// Your pending free agents are re-signed one-click at the engine's suggested
// terms or let walk; the open market lists players who walked league-wide and
// can be signed within cap. "Done" commits the off-season and opens the trade
// flow.

const money = (n: number) => `$${n.toFixed(2)}M`;

const tierColor = (tier: OffseasonPending["contract"]["tier"]): string =>
  tier === "STAR" ? "var(--ledger-red)"
  : tier === "TOP" ? "var(--ledger-navy)"
  : tier === "MIDDLE" ? "var(--ledger-amber)"
  : "var(--ledger-ink-faint)";

function Terms({ c }: { c: OffseasonPending["contract"] }) {
  return (
    <span className="font-mono text-[11px] font-black" style={{ color: tierColor(c.tier) }}>
      {money(c.aav)} × {c.term}yr
      <span className="ml-1.5 text-[9px]" style={{ color: "var(--ledger-ink-faint)" }}>{c.status}</span>
    </span>
  );
}

function PlayerMeta({ p }: { p: OffseasonPending["player"] }) {
  // p.capHit is zeroed for pending FAs; lastCapHit preserves the real expiring deal.
  const wasCap = p.lastCapHit ?? p.capHit;
  return (
    <span className="text-[9px] font-mono uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
      {p.position} · age {p.age} · was {money(wasCap)}
    </span>
  );
}

export default function ResignPhase({
  homeTeam, capSpace, pending, market, roster, onResign, onWalk, onSign, onDrop, onDone,
}: {
  homeTeam: Team;
  capSpace: number;
  pending: OffseasonPending[];
  market: OffseasonPending[];
  roster: Asset[];
  onResign: (p: OffseasonPending) => void;
  onWalk: (p: OffseasonPending) => void;
  onSign: (p: OffseasonPending) => void;
  onDrop: (p: Asset) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [dropQuery, setDropQuery] = useState("");
  const [showDrop, setShowDrop] = useState(false);

  const sortedMarket = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...market]
      .filter((m) => (q ? m.player.name.toLowerCase().includes(q) : true))
      .sort((a, b) => b.contract.aav - a.contract.aav)
      .slice(0, 60);
  }, [market, query]);

  // Signed players the user can release for cap relief. Pending FAs are handled
  // above, so exclude them here; picks are never droppable.
  const pendingIds = useMemo(() => new Set(pending.map((p) => p.player.id)), [pending]);
  const droppable = useMemo(() => {
    const q = dropQuery.trim().toLowerCase();
    return roster
      .filter((p) => p.position !== "Pick" && !pendingIds.has(p.id))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => (b.capHit ?? 0) - (a.capHit ?? 0))
      .slice(0, 60);
  }, [roster, pendingIds, dropQuery]);

  if (typeof document === "undefined") return null;

  const overCap = capSpace < 0;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(28,20,10,0.88)", backdropFilter: "blur(4px)" }}>
      <div className="relative w-full max-w-3xl flex flex-col"
        style={{ background: "var(--ledger-card-light)", borderRadius: "2px", maxHeight: "92vh", boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="shrink-0" style={{ borderTop: "4px double #1c140a", borderBottom: "1px solid #b8a070", padding: "16px 24px 12px" }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
                The Hockey Ledger · Off-Season
              </div>
              <h2 className="font-black" style={{ fontSize: "1.4rem", color: "var(--ledger-ink)", lineHeight: 1.1 }}>
                {homeTeam.name} — Re-Sign Phase
              </h2>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-[0.2em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>Cap Space</div>
              <div className="font-mono font-black text-lg" style={{ color: overCap ? "var(--ledger-red)" : "var(--ledger-green)" }}>
                {money(capSpace)}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4" style={{ flex: 1, minHeight: 0 }}>
          {/* Pending free agents */}
          <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono mb-3" style={{ color: "var(--ledger-ink-faint)" }}>
            Your Pending Free Agents — {pending.length}
          </div>
          {pending.length === 0 ? (
            <p className="text-[12px] italic mb-5" style={{ color: "var(--ledger-brown)" }}>
              No expiring contracts to resolve. Sign from the market below or proceed to trades.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 mb-6">
              {pending.map((fa) => (
                <div key={fa.player.id} className="flex items-center justify-between gap-3 px-3 py-2"
                  style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                  <div className="min-w-0">
                    <div className="font-black text-[13px] truncate" style={{ color: "var(--ledger-ink)" }}>{fa.player.name}</div>
                    <PlayerMeta p={fa.player} />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Terms c={fa.contract} />
                    <button onClick={() => onResign(fa)}
                      className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono"
                      style={{ background: "var(--ledger-green)", color: "#fff", borderRadius: "2px" }}>
                      Re-Sign
                    </button>
                    <button onClick={() => onWalk(fa)}
                      className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono"
                      style={{ background: "transparent", color: "var(--ledger-red)", border: "1px solid var(--ledger-red)", borderRadius: "2px" }}>
                      Let Walk
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Release a signed player — clean release frees the full cap hit */}
          <div className="mb-6">
            <button onClick={() => setShowDrop((s) => !s)}
              className="text-[10px] font-black uppercase tracking-[0.3em] font-mono mb-2 flex items-center gap-2"
              style={{ color: "var(--ledger-ink-faint)", background: "transparent", border: "none", cursor: "pointer" }}>
              <span>{showDrop ? "▾" : "▸"}</span> Release a Player — free cap
            </button>
            {showDrop && (
              <>
                <input
                  value={dropQuery}
                  onChange={(e) => setDropQuery(e.target.value)}
                  placeholder="Search your roster…"
                  className="text-[11px] font-mono outline-none px-2 py-1 mb-2 w-full"
                  style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule)", borderRadius: "2px", color: "var(--ledger-ink)" }}
                />
                <div className="flex flex-col gap-1">
                  {droppable.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-1.5"
                      style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                      <div className="min-w-0">
                        <div className="font-bold text-[12px] truncate" style={{ color: "var(--ledger-ink)" }}>{p.name}</div>
                        <span className="text-[9px] font-mono uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
                          {p.position} · age {p.age} · {money(p.capHit ?? 0)} × {p.yearsRemaining ?? 0}yr
                        </span>
                      </div>
                      <button onClick={() => onDrop(p)}
                        className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono shrink-0"
                        style={{ background: "transparent", color: "var(--ledger-red)", border: "1px solid var(--ledger-red)", borderRadius: "2px" }}>
                        Release
                      </button>
                    </div>
                  ))}
                  {droppable.length === 0 && (
                    <p className="text-[11px] italic" style={{ color: "var(--ledger-brown)" }}>No rostered players match.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Open market */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
              Free-Agent Market — {market.length}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search market…"
              className="text-[11px] font-mono outline-none px-2 py-1"
              style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule)", borderRadius: "2px", color: "var(--ledger-ink)", width: 160 }}
            />
          </div>
          <div className="flex flex-col gap-1">
            {sortedMarket.map((fa) => {
              const affordable = fa.contract.aav <= capSpace;
              const isRfa = fa.contract.status === "RFA";
              const offerPicks = isRfa ? getOfferSheetCompensation(fa.contract.aav) : [];
              return (
                <div key={fa.player.id} className="flex items-center justify-between gap-3 px-3 py-1.5"
                  style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                  <div className="min-w-0">
                    <div className="font-bold text-[12px] truncate" style={{ color: "var(--ledger-ink)" }}>{fa.player.name}</div>
                    <PlayerMeta p={fa.player} />
                    {isRfa && offerPicks.length > 0 && (
                      <span className="text-[9px] font-mono font-black uppercase tracking-wide"
                        style={{ color: "var(--ledger-amber, #c87941)" }}
                        title="CBA offer-sheet compensation owed to original team if they don't match">
                        ⚠ Offer sheet · picks owed: {offerPicks.join(" + ")}
                      </span>
                    )}
                    {isRfa && offerPicks.length === 0 && (
                      <span className="text-[9px] font-mono uppercase tracking-wide"
                        style={{ color: "var(--ledger-ink-faint)" }}>
                        RFA · no comp
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Terms c={fa.contract} />
                    <button
                      onClick={() => onSign(fa)}
                      disabled={!affordable}
                      title={affordable ? (isRfa ? `Sign via offer sheet (${offerPicks.length ? offerPicks.join(" + ") + " compensation" : "no pick comp"})` : "Sign to your roster") : "Not enough cap space"}
                      className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono"
                      style={{
                        background: affordable ? "var(--ledger-navy)" : "transparent",
                        color: affordable ? "#fff" : "var(--ledger-ink-faint)",
                        border: affordable ? "none" : "1px solid var(--ledger-rule)",
                        borderRadius: "2px",
                        cursor: affordable ? "pointer" : "not-allowed",
                        opacity: affordable ? 1 : 0.6,
                      }}>
                      {isRfa ? "Offer Sheet" : "Sign"}
                    </button>
                  </div>
                </div>
              );
            })}
            {sortedMarket.length === 0 && (
              <p className="text-[11px] italic" style={{ color: "var(--ledger-brown)" }}>No market players match.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid #b8a070" }}>
          <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            Other teams have resolved their own free agents.
          </p>
          <button onClick={onDone}
            className="text-[11px] font-black uppercase tracking-[0.18em] px-5 py-2 font-mono"
            style={{ background: "var(--ledger-ink)", color: "var(--ledger-card-light)", borderRadius: "2px" }}>
            Done — Proceed to Trades →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
