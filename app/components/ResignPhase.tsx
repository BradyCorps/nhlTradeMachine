"use client";

import React, { useEffect, useMemo, useState } from "react";
import { offseasonCta } from "@/app/lib/offseason-phases";
import { sortPendingByRights } from "@/app/lib/free-agency";
import { createPortal } from "react-dom";
import type { Asset, Team, XNAVResult } from "@/app/lib/trade-types";
import { displayPosition } from "@/app/lib/display-position";
import type { OffseasonPending } from "@/app/lib/free-agency";
import { getOfferSheetCompensation } from "@/app/lib/free-agency";
import StrandView from "@/app/components/StrandView";
import { DevelopmentProfilePanel } from "@/app/components/DevelopmentProfilePanel";
import { computeGravity } from "@/app/lib/gravity";
import { CompactGravity } from "@/app/components/GravityField";
import { formatCapHit as money } from "@/app/lib/display-utils";
const MARKET_PAGE_SIZE = 30;

// FAs come through without a computed NAV; StrandView derives its axes from the
// asset's own Point Shares / pace / usage, so a neutral NAV is fine here.
const ZERO_XNAV: XNAVResult = { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };

// Compact last-season (2026) stat line. Skaters: GP · G-A-P pace · TOI.
// Goalies: GP · SV% · GSAx.
function StatLine({ p }: { p: Asset }) {
  const isG = p.position === "G";
  const bits: string[] = [];
  if (isG) {
    if (p.gamesStarted) bits.push(`${p.gamesStarted} GS`);
    if (p.savePct != null) bits.push(`${(p.savePct * 100).toFixed(1)}% SV`);
    if (p.gsax != null) bits.push(`${p.gsax > 0 ? "+" : ""}${p.gsax.toFixed(1)} GSAx`);
  } else {
    const gp = p.games ?? 0;
    if (gp) bits.push(`${gp} GP`);
    if (p.goalsPace != null && p.assistsPace != null && gp > 0) {
      const gf = gp / 82;
      const g = Math.round(p.goalsPace * gf);
      const a = Math.round(p.assistsPace * gf);
      bits.push(`${g}G-${a}A-${g + a}P`);
    } else if (p.ptsPace && gp > 0) {
      bits.push(`${Math.round(p.ptsPace * gp / 82)}P`);
    }
    if (p.avgTOI) bits.push(`${p.avgTOI.toFixed(1)} TOI`);
  }
  if (bits.length === 0) return null;
  return (
    <span className="text-[10px] font-mono tracking-wide" style={{ color: "var(--ledger-brown)" }}>
      &rsquo;26 · {bits.join(" · ")}
    </span>
  );
}

function ExpandedStats({ p, nav }: { p: Asset; nav: XNAVResult }) {
  const isG = p.position === "G";
  const gravity = !isG ? computeGravity(p) : null;
  const fmtPct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : "—";
  const fmtDec = (v: number | null | undefined, sign = false) =>
    v != null ? `${sign && v > 0 ? "+" : ""}${v.toFixed(1)}` : "—";

  return (
    <div
      className="px-3 py-2 mt-1 grid gap-x-4 gap-y-1"
      style={{
        background: "var(--paper-inset)",
        border: "1px solid var(--ledger-rule-light)",
        borderRadius: "2px",
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      }}
      role="region"
      aria-label={`Advanced stats for ${p.name}`}
    >
      {/* X-NAV breakdown */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.12em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>X-NAV</div>
        <div className="text-[12px] font-black font-mono" style={{ color: nav.total >= 0 ? "var(--ledger-green)" : "var(--ledger-red)" }}>
          {nav.total > 0 ? "+" : ""}{nav.total.toFixed(0)}
        </div>
        <div className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
          Off {fmtDec(nav.off, true)} · Def {fmtDec(nav.def, true)} · Age {fmtDec(nav.age, true)} · Cap {fmtDec(nav.cap, true)}
        </div>
      </div>

      {/* Production */}
      {!isG && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>Production</div>
          <div className="text-[10px] font-mono" style={{ color: "var(--ledger-brown)" }}>
            P/82: {fmtDec(p.ptsPace)} · xG/82: {fmtDec(p.xGPace)}
          </div>
          {p.ops != null && <div className="text-[10px] font-mono" style={{ color: "var(--ledger-brown)" }}>OPS: {fmtDec(p.ops)} · DPS: {fmtDec(p.dps)}</div>}
        </div>
      )}

      {/* Impact */}
      {!isG && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>Impact</div>
          <div className="text-[10px] font-mono" style={{ color: "var(--ledger-brown)" }}>
            NOIV: {fmtDec(p.xgRelTM, true)} · xGA Rel: {fmtDec(p.xgaRelTM, true)}
          </div>
          {p.dzPct != null && <div className="text-[10px] font-mono" style={{ color: "var(--ledger-brown)" }}>DZ%: {fmtPct(p.dzPct)}</div>}
        </div>
      )}

      {/* Goalie */}
      {isG && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>Goaltending</div>
          <div className="text-[10px] font-mono" style={{ color: "var(--ledger-brown)" }}>
            SV%: {fmtPct(p.savePct)} · GSAx: {fmtDec(p.gsax, true)}
          </div>
        </div>
      )}

      {/* EDGE */}
      {(p.edgeSpeedMaxMph != null || p.hdFinishingDelta != null) && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>EDGE</div>
          <div className="text-[10px] font-mono" style={{ color: "var(--ledger-brown)" }}>
            {p.edgeSpeedMaxMph != null ? `Speed: ${p.edgeSpeedMaxMph.toFixed(1)} mph` : ""}
            {p.hdFinishingDelta != null ? ` · HD: ${(p.hdFinishingDelta * 100) > 0 ? "+" : ""}${(p.hdFinishingDelta * 100).toFixed(1)}%` : ""}
          </div>
        </div>
      )}

      {/* Gravity */}
      {gravity && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] font-mono mb-0.5" style={{ color: "var(--ledger-ink-faint)" }}>Gravity</div>
          <CompactGravity profile={gravity} />
        </div>
      )}
    </div>
  );
}

const tierColor = (tier: OffseasonPending["contract"]["tier"]): string =>
  tier === "STAR" ? "var(--ledger-red)"
  : tier === "TOP" ? "var(--ledger-navy)"
  : tier === "MIDDLE" ? "var(--ledger-amber)"
  : "var(--ledger-ink-faint)";

function Terms({ c }: { c: OffseasonPending["contract"] }) {
  return (
    <span className="font-mono text-[11px] font-black" style={{ color: tierColor(c.tier) }}>
      {money(c.aav)} × {c.term}yr
      <span className="ml-1.5 text-[10px]" style={{ color: "var(--ledger-ink-faint)" }}>{c.status}</span>
    </span>
  );
}

function PlayerMeta({ p }: { p: OffseasonPending["player"] }) {
  // p.capHit is zeroed for pending FAs; lastCapHit preserves the real expiring deal.
  const wasCap = p.lastCapHit ?? p.capHit;
  return (
    <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
      {displayPosition(p.position, p.secondaryPosition)} · age {p.age}{wasCap > 0 ? ` · was ${money(wasCap)}` : ""}
    </span>
  );
}

export default function ResignPhase({
  homeTeam, capSpace, pending, market, roster, navMap, onResign, onWalk, onSign, onDrop, onDone,
}: {
  homeTeam: Team;
  capSpace: number;
  pending: OffseasonPending[];
  market: OffseasonPending[];
  roster: Asset[];
  navMap?: Record<string, XNAVResult>;
  onResign: (p: OffseasonPending) => void;
  onWalk: (p: OffseasonPending) => void;
  onSign: (p: OffseasonPending) => void;
  onDrop: (p: Asset) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [dropQuery, setDropQuery] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [detail, setDetail] = useState<Asset | null>(null);
  const [marketSort, setMarketSort] = useState<"ask" | "nav" | "age">("ask");
  const [marketPage, setMarketPage] = useState(1);
  const [expandedFaId, setExpandedFaId] = useState<string | null>(null);

  const sortedMarket = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...market]
      .filter((m) => (q ? m.player.name.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (marketSort === "nav") return (navMap?.[b.player.id]?.total ?? 0) - (navMap?.[a.player.id]?.total ?? 0);
        if (marketSort === "age") return a.player.age - b.player.age;
        return b.contract.aav - a.contract.aav;
      })
  }, [market, query, marketSort, navMap]);
  const marketPageCount = Math.max(1, Math.ceil(sortedMarket.length / MARKET_PAGE_SIZE));
  const marketPageItems = useMemo(() => {
    const start = (marketPage - 1) * MARKET_PAGE_SIZE;
    return sortedMarket.slice(start, start + MARKET_PAGE_SIZE);
  }, [sortedMarket, marketPage]);
  const marketStart = sortedMarket.length === 0 ? 0 : (marketPage - 1) * MARKET_PAGE_SIZE + 1;
  const marketEnd = Math.min(sortedMarket.length, marketPage * MARKET_PAGE_SIZE);

  useEffect(() => setMarketPage(1), [query, marketSort]);
  useEffect(() => {
    setMarketPage((page) => Math.min(page, marketPageCount));
  }, [marketPageCount]);

  // Signed players the user can release for cap relief. Pending FAs are handled
  // above, so exclude them here; picks are never droppable.
  // RFA business precedes UFA business in a real offseason, and an RFA walked
  // is team control surrendered — so those decisions come first (OFF2).
  const orderedPending = useMemo(() => sortPendingByRights(pending), [pending]);
  const rfaCount = useMemo(
    () => pending.filter((p) => p.contract.status === "RFA").length, [pending]);

  const pendingIds = useMemo(() => new Set(pending.map((p) => p.player.id)), [pending]);
  const droppable = useMemo(() => {
    const q = dropQuery.trim().toLowerCase();
    return roster
      .filter((p) => p.position !== "Pick" && !pendingIds.has(p.id))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => (b.capHit ?? 0) - (a.capHit ?? 0));
  }, [roster, pendingIds, dropQuery]);

  if (typeof document === "undefined") return null;

  const overCap = capSpace < 0;

  return createPortal(
    <>
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(28,20,10,0.88)", backdropFilter: "blur(4px)" }}>
      <div
        className="relative w-full max-w-3xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resign-phase-title"
        style={{ background: "var(--ledger-card-light)", borderRadius: "2px", maxHeight: "92vh", boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="shrink-0" style={{ borderTop: "4px double #1c140a", borderBottom: "1px solid #b8a070", padding: "16px 16px 12px" }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
                The Hockey Ledger · Off-Season
              </div>
              <h2 id="resign-phase-title" className="font-black" style={{ fontSize: "1.4rem", color: "var(--ledger-ink)", lineHeight: 1.1 }}>
                {homeTeam.name} — Re-Sign Phase
              </h2>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.2em] font-mono" style={{ color: "var(--ledger-ink-faint)" }} id="resign-cap-label">Cap Space</div>
              <div className="font-mono font-black text-lg"
                aria-live="polite"
                aria-labelledby="resign-cap-label"
                style={{ color: overCap ? "var(--ledger-red)" : "var(--ledger-green)" }}>
                {money(capSpace)}{overCap ? " over" : ""}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-3 sm:px-5 py-4" style={{ flex: 1, minHeight: 0 }}>
          {/* Pending free agents — restricted first, then unrestricted */}
          <h3 className="text-[11px] font-black uppercase tracking-[0.3em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
            Your Pending Free Agents — {pending.length}
          </h3>
          {pending.length > 0 && (
            <p className="text-[10px] font-mono mb-3" style={{ color: "var(--ledger-brown)" }}>
              {rfaCount} restricted {rfaCount === 1 ? "right" : "rights"} shown first
              {pending.length - rfaCount > 0 && `, then ${pending.length - rfaCount} unrestricted`}
              {" — "}walking an RFA gives up team control.
            </p>
          )}
          {pending.length === 0 ? (
            <p className="text-[12px] italic mb-5" style={{ color: "var(--ledger-brown)" }}>
              No expiring contracts to resolve. Sign from the market below or proceed to trades.
            </p>
          ) : (
            <ul role="list" className="flex flex-col gap-1.5 mb-6" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {orderedPending.map((fa, i) => {
                // You can't add salary you don't have room for — re-signing is
                // gated by cap space just like a market signing. (No cap room →
                // let him walk, or free space via trades/buyouts first.)
                const affordable = fa.contract.aav <= capSpace;
                const projectedCap = capSpace - fa.contract.aav;
                return (
                <li key={fa.player.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 py-2"
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--ledger-rule-light)",
                    borderRadius: "2px",
                    // A rule between the last RFA and the first UFA, so the two
                    // groups read as groups without a second heading.
                    marginTop: i > 0 && fa.contract.status === "UFA"
                      && orderedPending[i - 1].contract.status === "RFA" ? 10 : 0,
                    borderTopWidth: i > 0 && fa.contract.status === "UFA"
                      && orderedPending[i - 1].contract.status === "RFA" ? 3 : 1,
                    borderTopStyle: "solid",
                  }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => setDetail(fa.player)} title="View STRAND & development"
                        className="tap-target font-black text-[13px] truncate text-left hover:underline"
                        style={{ color: "var(--ledger-ink)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                        {fa.player.name}
                      </button>
                      <span
                        className="text-[10px] font-black uppercase tracking-[0.12em] font-mono px-1.5 py-0.5"
                        title={fa.contract.status === "RFA"
                          ? "Restricted — you hold his rights; letting him walk surrenders them"
                          : "Unrestricted — free to sign anywhere"}
                        style={{
                          border: "1px solid var(--ledger-rule)",
                          borderRadius: "2px",
                          color: fa.contract.status === "RFA" ? "var(--ledger-ink)" : "var(--ledger-brown)",
                          background: fa.contract.status === "RFA" ? "var(--paper-inset)" : "transparent",
                        }}>
                        {fa.contract.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <PlayerMeta p={fa.player} />
                      <StatLine p={fa.player} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className="text-right">
                      <Terms c={fa.contract} />
                      <div className="text-[10px] font-mono tabular-nums" style={{ color: affordable ? "var(--ledger-green)" : "var(--ledger-red)" }}>
                        {affordable ? `${money(projectedCap)} left` : "over cap"}
                      </div>
                    </div>
                    <button onClick={() => affordable && onResign(fa)}
                      disabled={!affordable}
                      aria-label={`Re-sign ${fa.player.name}`}
                      title={affordable ? "Re-sign to your roster" : "Not enough cap space — let him walk or free room first"}
                      className="tap-target text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono"
                      style={{ background: affordable ? "var(--ledger-green)" : "var(--ledger-rule)", color: "#fff", borderRadius: "2px", opacity: affordable ? 1 : 0.5, cursor: affordable ? "pointer" : "not-allowed" }}>
                      Re-Sign
                    </button>
                    <button onClick={() => onWalk(fa)}
                      aria-label={`Let ${fa.player.name} walk`}
                      className="tap-target text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono"
                      style={{ background: "transparent", color: "var(--ledger-red)", border: "1px solid var(--ledger-red)", borderRadius: "2px" }}>
                      Let Walk
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
          )}

          {/* Release a signed player — clean release frees the full cap hit */}
          <div className="mb-6">
            <button onClick={() => setShowDrop((s) => !s)}
              aria-expanded={showDrop}
              aria-label={showDrop ? "Hide release player list" : "Show release player list"}
              className="tap-target text-[10px] font-black uppercase tracking-[0.3em] font-mono mb-2 flex items-center gap-2"
              style={{ color: "var(--ledger-ink-faint)", background: "transparent", border: "none", cursor: "pointer" }}>
              <span>{showDrop ? "▾" : "▸"}</span> Release a Player — free cap
            </button>
            {showDrop && (
              <>
                <input
                  value={dropQuery}
                  onChange={(e) => setDropQuery(e.target.value)}
                  placeholder="Search your roster…"
                  aria-label="Search your roster to release a player"
                  className="text-[11px] font-mono px-2 py-1 mb-2 w-full"
                  style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule)", borderRadius: "2px", color: "var(--ledger-ink)" }}
                />
                <div className="flex flex-col gap-1">
                  {droppable.map((p) => (
                    <div key={p.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 px-3 py-1.5"
                      style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                      <div className="min-w-0">
                        <div className="font-bold text-[12px] truncate" style={{ color: "var(--ledger-ink)" }}>{p.name}</div>
                        <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
                          {displayPosition(p.position, p.secondaryPosition)} · age {p.age} · {money(p.capHit ?? 0)} × {p.yearsRemaining ?? 0}yr
                        </span>
                      </div>
                      <button onClick={() => onDrop(p)}
                        aria-label={`Release ${p.name}`}
                        className="tap-target text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono shrink-0 self-end sm:self-auto"
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
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-[0.3em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                Free-Agent Market — {sortedMarket.length}{query.trim() ? ` of ${market.length}` : ""}
              </h3>
              <div className="flex gap-1 mt-1">
                {([
                  ["ask", "Ask"],
                  ["nav", "NAV"],
                  ["age", "Age"],
                ] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setMarketSort(key)}
                    aria-pressed={marketSort === key}
                    className="tap-target text-[10px] font-black uppercase tracking-wider px-2 py-1 font-mono"
                    style={{
                      background: marketSort === key ? "var(--ledger-ink)" : "transparent",
                      color: marketSort === key ? "var(--ledger-card-light)" : "var(--ledger-ink-faint)",
                      border: "1px solid var(--ledger-rule)",
                      borderRadius: "2px",
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search market…"
              aria-label="Search the free-agent market"
              className="text-[11px] font-mono px-2 py-1"
              style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule)", borderRadius: "2px", color: "var(--ledger-ink)", width: 160 }}
            />
          </div>
          <div className="flex flex-col gap-1">
            {marketPageItems.map((fa) => {
              const affordable = fa.contract.aav <= capSpace;
              const isRfa = fa.contract.status === "RFA";
              const offerPicks = isRfa ? getOfferSheetCompensation(fa.contract.aav) : [];
              const nav = navMap?.[fa.player.id]?.total ?? 0;
              const projectedCap = capSpace - fa.contract.aav;
              const capPct = capSpace > 0 ? Math.min(100, Math.max(4, (fa.contract.aav / Math.max(capSpace, fa.contract.aav)) * 100)) : 100;
              const edgeDelta = fa.player.hdFinishingDelta;
              const edgeLabel = edgeDelta == null
                ? null
                : `EDGE HD ${edgeDelta > 0 ? "+" : ""}${(edgeDelta * 100).toFixed(1)}%`;
              const ageArrow = fa.player.age <= 24 ? "↑" : fa.player.age >= 30 ? "↓" : "→";
              const ageColor = fa.player.age <= 24 ? "var(--ledger-green)" : fa.player.age >= 30 ? "var(--ledger-red)" : "var(--ledger-ink-faint)";
              const isExpanded = expandedFaId === fa.player.id;
              const fullNav = navMap?.[fa.player.id] ?? ZERO_XNAV;
              return (
                <div key={fa.player.id}
                  style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setExpandedFaId(isExpanded ? null : fa.player.id)}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Collapse" : "Expand"} stats for ${fa.player.name}`}
                          className="tap-target font-bold text-[12px] truncate text-left hover:underline"
                          style={{ color: "var(--ledger-ink)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                          {fa.player.name}
                        </button>
                        <button
                          onClick={() => setExpandedFaId(isExpanded ? null : fa.player.id)}
                          aria-hidden="true"
                          tabIndex={-1}
                          className="text-[10px] font-mono"
                          style={{
                            color: "var(--ledger-ink-faint)", background: "transparent", border: "none",
                            cursor: "pointer", padding: 0, transform: isExpanded ? "rotate(180deg)" : "none",
                            transition: "transform 0.15s",
                          }}>
                          ▼
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <PlayerMeta p={fa.player} />
                        <StatLine p={fa.player} />
                        <span className="text-[10px] font-mono font-black tabular-nums" style={{ color: nav >= 0 ? "var(--ledger-green)" : "var(--ledger-red)" }}>
                          NAV {nav > 0 ? "+" : ""}{nav.toFixed(0)}
                        </span>
                        {edgeLabel && (
                          <span className="text-[10px] font-mono font-black uppercase tracking-wide"
                            style={{ color: edgeDelta != null && edgeDelta < 0 ? "var(--ledger-green)" : "var(--ledger-brown)" }}>
                            {edgeLabel}
                          </span>
                        )}
                        <span className="text-[10px] font-mono font-black uppercase tracking-wide" style={{ color: ageColor }}>
                          Age {ageArrow}
                        </span>
                      </div>
                      {isRfa && offerPicks.length > 0 && (
                        <div>
                          <span className="text-[10px] font-mono font-black uppercase tracking-wide"
                            style={{ color: "var(--ledger-amber, #c87941)" }}
                            title="CBA offer-sheet compensation owed to original team if they don't match">
                            ⚠ Offer sheet · picks owed: {offerPicks.join(" + ")}
                          </span>
                        </div>
                      )}
                      {isRfa && offerPicks.length === 0 && (
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wide"
                            style={{ color: "var(--ledger-ink-faint)" }}>
                            RFA · no comp
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="min-w-[132px]">
                        <div className="flex items-center justify-between gap-2">
                          <Terms c={fa.contract} />
                          <span className="text-[10px] font-mono tabular-nums" style={{ color: affordable ? "var(--ledger-green)" : "var(--ledger-red)" }}>
                            {money(projectedCap)}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5" style={{ background: "var(--paper-inset)", border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
                          <div style={{
                            width: `${capPct}%`,
                            height: "100%",
                            background: affordable ? "var(--ledger-green)" : "var(--ledger-red)",
                          }} />
                        </div>
                      </div>
                      <button
                        onClick={() => onSign(fa)}
                        disabled={!affordable}
                        aria-label={`${isRfa ? "Offer sheet" : "Sign"} ${fa.player.name}`}
                        title={affordable ? (isRfa ? `Sign via offer sheet (${offerPicks.length ? offerPicks.join(" + ") + " compensation" : "no pick comp"})` : "Sign to your roster") : "Not enough cap space"}
                        className="tap-target text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono"
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
                  {isExpanded && <ExpandedStats p={fa.player} nav={fullNav} />}
                </div>
              );
            })}
            {sortedMarket.length === 0 && (
              <p className="text-[11px] italic" style={{ color: "var(--ledger-brown)" }}>No market players match.</p>
            )}
          </div>
          {sortedMarket.length > MARKET_PAGE_SIZE && (
            <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                Showing {marketStart}-{marketEnd} of {sortedMarket.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMarketPage((page) => Math.max(1, page - 1))}
                  disabled={marketPage === 1}
                  aria-label="Previous free agent page"
                  className="tap-target flex-1 text-[10px] font-black uppercase tracking-wider px-3 py-2 font-mono sm:flex-none"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--ledger-rule)",
                    color: marketPage === 1 ? "var(--ledger-ink-faint)" : "var(--ledger-ink)",
                    borderRadius: "2px",
                    opacity: marketPage === 1 ? 0.5 : 1,
                  }}>
                  Previous
                </button>
                <span className="text-[10px] font-mono font-black tabular-nums" style={{ color: "var(--ledger-ink)" }}>
                  {marketPage}/{marketPageCount}
                </span>
                <button
                  onClick={() => setMarketPage((page) => Math.min(marketPageCount, page + 1))}
                  disabled={marketPage === marketPageCount}
                  aria-label="Next free agent page"
                  className="tap-target flex-1 text-[10px] font-black uppercase tracking-wider px-3 py-2 font-mono sm:flex-none"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--ledger-rule)",
                    color: marketPage === marketPageCount ? "var(--ledger-ink-faint)" : "var(--ledger-ink)",
                    borderRadius: "2px",
                    opacity: marketPage === marketPageCount ? 0.5 : 1,
                  }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 sm:px-5 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3" style={{ borderTop: "1px solid #b8a070" }}>
          <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            Other teams have resolved their own free agents.
          </p>
          <button onClick={onDone}
            className="tap-target text-[11px] font-black uppercase tracking-[0.18em] px-5 py-2 font-mono shrink-0"
            style={{ background: "var(--ledger-ink)", color: "var(--ledger-card-light)", borderRadius: "2px" }}>
            {offseasonCta("RESIGN")}
          </button>
        </div>
      </div>
    </div>

    {/* Player detail — STRAND + development + last-season stats */}
    {detail && (
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6"
        style={{ background: "rgba(28,20,10,0.92)", backdropFilter: "blur(5px)" }}
        onClick={() => setDetail(null)}>
        <div
          className="relative w-full max-w-md flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="free-agent-detail-title"
          style={{ background: "var(--ledger-card-light)", borderRadius: "2px", maxHeight: "92vh", boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}
          onClick={(e) => e.stopPropagation()}>
          <div className="shrink-0 flex items-start justify-between gap-3"
            style={{ borderTop: "4px double #1c140a", borderBottom: "1px solid #b8a070", padding: "14px 20px 12px" }}>
            <div className="min-w-0">
              <h2 id="free-agent-detail-title" className="font-black text-[1.15rem] leading-tight truncate" style={{ color: "var(--ledger-ink)" }}>{detail.name}</h2>
              <div className="mt-0.5"><PlayerMeta p={detail} /></div>
              <div><StatLine p={detail} /></div>
            </div>
            <button onClick={() => setDetail(null)}
              className="tap-target text-[16px] leading-none shrink-0" aria-label="Close free agent details"
              style={{ background: "transparent", border: "none", color: "var(--ledger-ink-faint)", cursor: "pointer" }}>
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-3" style={{ flex: 1, minHeight: 0 }}>
            {detail.position !== "G" ? (
              <StrandView asset={detail} xnav={ZERO_XNAV} />
            ) : (
              <p className="text-[11px] font-mono py-2" style={{ color: "var(--ledger-ink-faint)" }}>
                STRAND is unavailable for goaltenders — see the stat line above.
              </p>
            )}
            {detail.developmentProfile && detail.position !== "G" && (
              <div className="mt-2"><DevelopmentProfilePanel asset={detail} /></div>
            )}
          </div>
        </div>
      </div>
    )}
    </>,
    document.body,
  );
}
