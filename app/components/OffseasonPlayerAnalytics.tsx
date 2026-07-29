"use client";
// ── Offseason player analytics ───────────────────────────────────
// The expandable stat panel and row furniture shared by every offseason list.
//
// These lived inside ResignPhase, so the RFA offer-sheet screen had no
// analytics at all — you were asked to commit picks and cap to a player while
// seeing less about him than a UFA on the previous screen (OFF4). Extracted
// rather than copied: "match the FA analytics" is a guarantee that only holds
// if there is one implementation.

import React, { useState } from "react";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import type { OffseasonPending } from "@/app/lib/free-agency";
import { displayPosition } from "@/app/lib/display-position";
import StrandView from "@/app/components/StrandView";
import { DevelopmentProfilePanel } from "@/app/components/DevelopmentProfilePanel";
import { computeGravity } from "@/app/lib/gravity";
import { CompactGravity } from "@/app/components/GravityField";
import { formatCapHit as money } from "@/app/lib/display-utils";

// FAs come through without a computed NAV; StrandView derives its axes from the
// asset's own Point Shares / pace / usage, so a neutral NAV is fine here.
export const ZERO_XNAV: XNAVResult = { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0 };

// Compact last-season (2026) stat line. Skaters: GP · G-A-P pace · TOI.
// Goalies: GP · SV% · GSAx.
export function StatLine({ p }: { p: Asset }) {
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

export function ExpandedStats({ p, nav }: { p: Asset; nav: XNAVResult }) {
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
  : tier === "TOP" ? "var(--ledger-ice)"
  : tier === "MIDDLE" ? "var(--ledger-amber)"
  : "var(--ledger-ink-faint)";

export function Terms({ c }: { c: OffseasonPending["contract"] }) {
  return (
    <span className="font-mono text-[11px] font-black" style={{ color: tierColor(c.tier) }}>
      {money(c.aav)} × {c.term}yr
      <span className="ml-1.5 text-[10px]" style={{ color: "var(--ledger-ink-faint)" }}>{c.status}</span>
    </span>
  );
}

export function PlayerMeta({ p }: { p: OffseasonPending["player"] }) {
  // p.capHit is zeroed for pending FAs; lastCapHit preserves the real expiring deal.
  const wasCap = p.lastCapHit ?? p.capHit;
  return (
    <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
      {displayPosition(p.position, p.secondaryPosition)} · age {p.age}{wasCap > 0 ? ` · was ${money(wasCap)}` : ""}
    </span>
  );
}

/**
 * Name + chevron that expand a player's advanced stats.
 *
 * One component so the two offseason screens cannot drift: same keyboard
 * behaviour, same `aria-expanded`, same 44px chevron target. The chevron is
 * aria-hidden because the name button is the accessible control — two focus
 * stops for one action is worse for a screen reader, not better.
 */
export function AnalyticsDisclosure({
  player, expanded, onToggle,
}: {
  player: Asset;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Header only. The panel is a full-width grid and belongs at the bottom of
  // the row, not nested in the name column — callers render <ExpandedStats>
  // there. Both halves are shared, so the two screens still cannot drift.
  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} stats for ${player.name}`}
          className="tap-target font-bold text-[12px] truncate text-left hover:underline"
          style={{ color: "var(--ledger-ink)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
          {player.name}
        </button>
        <button
          onClick={onToggle}
          aria-hidden="true"
          tabIndex={-1}
          className="tap-target text-[12px] font-mono flex items-center justify-center shrink-0"
          style={{
            color: "var(--ledger-ink-faint)", background: "transparent", border: "none",
            cursor: "pointer", padding: "0 8px",
            transform: expanded ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}>
          ▼
        </button>
      </div>
    </>
  );
}
