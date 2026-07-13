"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Asset, Team } from "@/app/lib/trade-types";
import { displayPosition } from "@/app/lib/display-position";
import type { OffseasonPending } from "@/app/lib/free-agency";
import {
  getOfferSheetCompensation,
  OFFER_SHEET_TIERS,
  resolveOfferSheet,
  type OfferSheetOutcome,
} from "@/app/lib/free-agency";
import { SEASON } from "@/app/lib/season-config";
import { scenarioSeed } from "@/app/lib/sim-engine";

const money = (n: number) => `$${n.toFixed(2)}M`;
const RFA_PAGE_SIZE = 30;

const roundLabel = (r: string) =>
  r === "1st" ? "1st" : r === "2nd" ? "2nd" : "3rd";

interface OfferResult {
  player: Asset;
  contract: OffseasonPending["contract"];
  outcome: OfferSheetOutcome;
  compensation: string[];
}

export default function OfferSheetPhase({
  homeTeam,
  capSpace,
  rfaMarket,
  teams,
  picks,
  onSign,
  onDone,
}: {
  homeTeam: Team;
  capSpace: number;
  rfaMarket: OffseasonPending[];
  teams: Team[];
  picks: Asset[];
  onSign: (fa: OffseasonPending, compensation: string[]) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OfferResult[]>([]);
  const [showTiers, setShowTiers] = useState(false);
  const [rfaPage, setRfaPage] = useState(1);

  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams]);

  const userPicks = useMemo(() =>
    picks.filter(p => p.position === "Pick" && p.teamId === homeTeam.id),
    [picks, homeTeam.id],
  );

  const hasPicksFor = (comp: string[]): boolean => {
    const needed: Record<string, number> = {};
    for (const r of comp) needed[r] = (needed[r] ?? 0) + 1;

    const available: Record<string, number> = {};
    for (const p of userPicks) {
      const rl = p.round === 1 ? "1st" : p.round === 2 ? "2nd" : p.round === 3 ? "3rd" : null;
      if (rl) available[rl] = (available[rl] ?? 0) + 1;
    }

    for (const [round, count] of Object.entries(needed)) {
      if ((available[round] ?? 0) < count) return false;
    }
    return true;
  };

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rfaMarket]
      .filter(m => (q ? m.player.name.toLowerCase().includes(q) || m.player.teamId.toLowerCase().includes(q) : true))
      .sort((a, b) => b.contract.aav - a.contract.aav);
  }, [rfaMarket, query]);
  const rfaPageCount = Math.max(1, Math.ceil(sorted.length / RFA_PAGE_SIZE));
  const visibleRfas = useMemo(() => {
    const start = (rfaPage - 1) * RFA_PAGE_SIZE;
    return sorted.slice(start, start + RFA_PAGE_SIZE);
  }, [sorted, rfaPage]);
  const rfaStart = sorted.length === 0 ? 0 : (rfaPage - 1) * RFA_PAGE_SIZE + 1;
  const rfaEnd = Math.min(sorted.length, rfaPage * RFA_PAGE_SIZE);

  useEffect(() => setRfaPage(1), [query]);
  useEffect(() => {
    setRfaPage((page) => Math.min(page, rfaPageCount));
  }, [rfaPageCount]);

  const handleOffer = (fa: OffseasonPending) => {
    const comp = getOfferSheetCompensation(fa.contract.aav);
    const origTeam = teamMap.get(fa.player.teamId);

    const outcome = resolveOfferSheet(fa.player, fa.contract, {
      seed: scenarioSeed({ offseason: homeTeam.id, season: SEASON.label }),
      signingTeamPhase: homeTeam.phase,
      signingTeamStanding: homeTeam.standing,
      originalTeamPhase: origTeam?.phase,
    });

    const result: OfferResult = { player: fa.player, contract: fa.contract, outcome, compensation: comp };
    setResults(prev => [result, ...prev]);

    if (outcome.result === "signed") {
      onSign(fa, comp);
    }
  };

  const alreadyOffered = useMemo(() => new Set(results.map(r => r.player.id)), [results]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(28,20,10,0.88)", backdropFilter: "blur(4px)" }}>
      <div
        className="relative w-full max-w-4xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-sheet-phase-title"
        style={{ background: "var(--ledger-card-light)", borderRadius: "2px", maxHeight: "92vh", boxShadow: "0 24px 70px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="shrink-0" style={{ borderTop: "4px double #1c140a", borderBottom: "1px solid #b8a070", padding: "16px 24px 12px" }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] font-mono mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
                The Hockey Ledger · Off-Season · CBA Article 10.3
              </div>
              <h2 id="offer-sheet-phase-title" className="font-black" style={{ fontSize: "1.4rem", color: "var(--ledger-ink)", lineHeight: 1.1 }}>
                {homeTeam.name} — RFA Offer Sheets
              </h2>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-[0.2em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>Cap Space</div>
              <div className="font-mono font-black text-lg" style={{ color: capSpace < 0 ? "var(--ledger-red)" : "var(--ledger-green)" }}>
                {money(capSpace)}
              </div>
            </div>
          </div>
          <p className="text-[10px] mt-2 leading-relaxed" style={{ color: "var(--ledger-ink-body)" }}>
            Sign another team&rsquo;s restricted free agent. The original team has 7 days to match.
            If they don&rsquo;t, you acquire the player but owe draft-pick compensation.
            {homeTeam.phase && (
              <span className="ml-1 font-black" style={{ color: "var(--ledger-amber)" }}>
                Your team phase: {homeTeam.phase}
              </span>
            )}
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-4" style={{ flex: 1, minHeight: 0 }}>
          {/* Offer results */}
          {results.length > 0 && (
            <div className="mb-5">
              <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono mb-2"
                style={{ color: "var(--ledger-ink-faint)" }}>
                Offer Sheet Results
              </div>
              <div className="flex flex-col gap-1.5">
                {results.map((r, i) => (
                  <div key={`${r.player.id}-${i}`} className="flex flex-col items-stretch gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    style={{
                      background: r.outcome.result === "signed" ? "rgba(26,92,46,0.08)"
                        : r.outcome.result === "matched" ? "rgba(184,48,32,0.06)"
                        : "rgba(138,92,0,0.06)",
                      border: "1px solid var(--ledger-rule-light)",
                      borderRadius: "2px",
                    }}>
                    <div className="min-w-0">
                      <span className="font-black text-[12px]" style={{ color: "var(--ledger-ink)" }}>
                        {r.player.name}
                      </span>
                      <span className="text-[10px] font-mono ml-2" style={{ color: "var(--ledger-ink-faint)" }}>
                        {money(r.contract.aav)} × {r.contract.term}yr
                      </span>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      {r.outcome.result === "signed" && (
                        <span className="text-[10px] font-black uppercase tracking-wider font-mono px-2 py-1"
                          style={{ background: "var(--ledger-green)", color: "#fff", borderRadius: "2px" }}>
                          Signed
                        </span>
                      )}
                      {r.outcome.result === "matched" && (
                        <span className="text-[10px] font-black font-mono" style={{ color: "var(--ledger-red)" }}>
                          {r.outcome.reason}
                        </span>
                      )}
                      {r.outcome.result === "declined" && (
                        <span className="text-[10px] font-black font-mono" style={{ color: "var(--ledger-amber)" }}>
                          {r.outcome.reason}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compensation tiers toggle */}
          <button onClick={() => setShowTiers(s => !s)}
            aria-expanded={showTiers}
            aria-label={showTiers ? "Hide offer sheet compensation reference" : "Show offer sheet compensation reference"}
            className="tap-target text-[10px] font-black uppercase tracking-[0.3em] font-mono mb-3 flex items-center gap-2"
            style={{ color: "var(--ledger-ink-faint)", background: "transparent", border: "none", cursor: "pointer" }}>
            <span>{showTiers ? "▾" : "▸"}</span> Compensation Reference
          </button>
          {showTiers && (
            <div className="mb-4 text-[10px] font-mono" style={{ border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
              {OFFER_SHEET_TIERS.map((tier, i) => (
                <div key={i} className="flex justify-between px-3 py-1.5"
                  style={{ borderBottom: i < OFFER_SHEET_TIERS.length - 1 ? "1px solid var(--ledger-rule-light)" : "none" }}>
                  <span style={{ color: "var(--ledger-ink)" }}>{tier.label}</span>
                  <span style={{ color: tier.compensation.length === 0 ? "var(--ledger-green)" : "var(--ledger-amber)" }}>
                    {tier.compensation.length === 0 ? "None" : tier.compensation.map(roundLabel).join(" + ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Available RFAs */}
          <div className="flex flex-col items-stretch gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
              Available RFAs — {sorted.length}{query.trim() ? ` of ${rfaMarket.length}` : ""}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or team…"
              className="w-full text-[11px] font-mono outline-none px-2 py-1 sm:w-[200px]"
              style={{ background: "var(--paper)", border: "1px solid var(--ledger-rule)", borderRadius: "2px", color: "var(--ledger-ink)" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            {visibleRfas.map((fa) => {
              const comp = getOfferSheetCompensation(fa.contract.aav);
              const affordable = fa.contract.aav <= capSpace;
              const hasPicks = hasPicksFor(comp);
              const canOffer = affordable && hasPicks && !alreadyOffered.has(fa.player.id);
              const offered = alreadyOffered.has(fa.player.id);
              const origTeam = teamMap.get(fa.player.teamId);

              return (
                <div key={fa.player.id} className="flex flex-col items-stretch gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  style={{
                    background: "var(--paper)",
                    border: "1px solid var(--ledger-rule-light)",
                    borderRadius: "2px",
                    opacity: offered ? 0.5 : 1,
                  }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-black text-[13px]" style={{ color: "var(--ledger-ink)" }}>
                        {fa.player.name}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-wide" style={{ color: "var(--ledger-ink-faint)" }}>
                        {displayPosition(fa.player.position, fa.player.secondaryPosition)} · age {fa.player.age} · {fa.player.teamId}
                        {origTeam?.phase && ` (${origTeam.phase})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="font-mono text-[11px] font-black" style={{
                        color: fa.contract.tier === "STAR" ? "var(--ledger-red)"
                          : fa.contract.tier === "TOP" ? "var(--ledger-navy)"
                          : fa.contract.tier === "MIDDLE" ? "var(--ledger-amber)"
                          : "var(--ledger-ink-faint)",
                      }}>
                        {money(fa.contract.aav)} × {fa.contract.term}yr
                      </span>
                      {comp.length > 0 && (
                        <span className="text-[9px] font-mono font-black uppercase tracking-wide"
                          style={{ color: "var(--ledger-amber)" }}>
                          Comp: {comp.map(roundLabel).join(" + ")}
                        </span>
                      )}
                      {comp.length === 0 && (
                        <span className="text-[9px] font-mono uppercase tracking-wide"
                          style={{ color: "var(--ledger-green)" }}>
                          No comp
                        </span>
                      )}
                      {!hasPicks && comp.length > 0 && (
                        <span className="text-[9px] font-mono font-black uppercase tracking-wide"
                          style={{ color: "var(--ledger-red)" }}>
                          Missing picks
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleOffer(fa)}
                    disabled={!canOffer}
                    aria-label={`Offer sheet ${fa.player.name}`}
                    title={
                      offered ? "Already offered"
                      : !affordable ? "Not enough cap space"
                      : !hasPicks ? "Missing required compensation picks"
                      : `Offer sheet — comp: ${comp.length === 0 ? "none" : comp.join(" + ")}`
                    }
                    className="tap-target w-full text-[10px] font-black uppercase tracking-wider px-3 py-1.5 font-mono shrink-0 sm:w-auto"
                    style={{
                      background: canOffer ? "var(--ledger-navy)" : "transparent",
                      color: canOffer ? "#fff" : "var(--ledger-ink-faint)",
                      border: canOffer ? "none" : "1px solid var(--ledger-rule)",
                      borderRadius: "2px",
                      cursor: canOffer ? "pointer" : "not-allowed",
                      opacity: canOffer ? 1 : 0.6,
                    }}>
                    {offered ? "Offered" : "Offer Sheet"}
                  </button>
                </div>
              );
            })}
            {sorted.length === 0 && (
              <p className="text-[11px] italic py-2" style={{ color: "var(--ledger-brown)" }}>
                No restricted free agents available.
              </p>
            )}
          </div>
          {sorted.length > RFA_PAGE_SIZE && (
            <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
                Showing {rfaStart}-{rfaEnd} of {sorted.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRfaPage((page) => Math.max(1, page - 1))}
                  disabled={rfaPage === 1}
                  aria-label="Previous RFA page"
                  className="tap-target flex-1 text-[10px] font-black uppercase tracking-wider px-3 py-2 font-mono sm:flex-none"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--ledger-rule)",
                    color: rfaPage === 1 ? "var(--ledger-ink-faint)" : "var(--ledger-ink)",
                    borderRadius: "2px",
                    opacity: rfaPage === 1 ? 0.5 : 1,
                  }}>
                  Previous
                </button>
                <span className="text-[10px] font-mono font-black tabular-nums" style={{ color: "var(--ledger-ink)" }}>
                  {rfaPage}/{rfaPageCount}
                </span>
                <button
                  onClick={() => setRfaPage((page) => Math.min(rfaPageCount, page + 1))}
                  disabled={rfaPage === rfaPageCount}
                  aria-label="Next RFA page"
                  className="tap-target flex-1 text-[10px] font-black uppercase tracking-wider px-3 py-2 font-mono sm:flex-none"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--ledger-rule)",
                    color: rfaPage === rfaPageCount ? "var(--ledger-ink-faint)" : "var(--ledger-ink)",
                    borderRadius: "2px",
                    opacity: rfaPage === rfaPageCount ? 0.5 : 1,
                  }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderTop: "1px solid #b8a070" }}>
          <p className="text-[10px] font-mono" style={{ color: "var(--ledger-ink-faint)" }}>
            {results.filter(r => r.outcome.result === "signed").length} offer sheet(s) signed
            {results.filter(r => r.outcome.result === "matched").length > 0 &&
              ` · ${results.filter(r => r.outcome.result === "matched").length} matched`}
            {results.filter(r => r.outcome.result === "declined").length > 0 &&
              ` · ${results.filter(r => r.outcome.result === "declined").length} declined`}
          </p>
          <button onClick={onDone}
            className="tap-target w-full text-[11px] font-black uppercase tracking-[0.18em] px-5 py-2 font-mono sm:w-auto"
            style={{ background: "var(--ledger-ink)", color: "var(--ledger-card-light)", borderRadius: "2px" }}>
            Done — Proceed to Free Agency →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
