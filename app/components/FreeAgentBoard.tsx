"use client";

// ── Free Agent Board — browse-only RFA/UFA lists ──────────────────
//
// `FA_POOL` is the internal holding id for unsigned players (fa-pool.ts).
// It must never surface as a team — the Trade Block panel was leaking it in
// exactly that way: a free agent flagged on the trade block rendered
// `p.teamId` raw, so "FA_POOL" printed where a real team abbreviation
// belongs, and selecting the row tried to set FA_POOL as a trade partner.
// Free agents aren't tradeable (you sign them, you don't trade for them), so
// the fix there is exclusion. This board is the replacement surface: a
// read-only, always-available list of who is actually unsigned right now,
// split Restricted / Unrestricted the way a free-agent tracker reads.

import React, { useMemo, useState } from "react";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";
import { useBodyScrollLock } from "@/app/lib/use-body-scroll-lock";
import { splitFreeAgents, type FreeAgentPosFilter } from "@/app/lib/free-agent-board";
import {
  PlayerMeta, StatLine, AnalyticsDisclosure, ExpandedStats, ZERO_XNAV,
} from "@/app/components/OffseasonPlayerAnalytics";

const POSITION_TABS = ["ALL", "C", "W", "D", "G"] as const;

interface Props {
  players: Asset[];
  navMap?: Record<string, XNAVResult>;
  onClose: () => void;
}

export default function FreeAgentBoard({ players, navMap, onClose }: Props) {
  const [posFilter, setPosFilter] = useState<FreeAgentPosFilter>("ALL");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useBodyScrollLock(true);

  const { rfa, ufa } = useMemo(
    () => splitFreeAgents(players, { posFilter, search }),
    [players, posFilter, search],
  );

  const renderRow = (p: Asset) => {
    const expanded = expandedId === p.id;
    const nav = navMap?.[p.id] ?? ZERO_XNAV;
    return (
      <div key={p.id} className="px-0 py-2" style={{ borderBottom: "1px solid var(--rule-light)" }}>
        <AnalyticsDisclosure player={p} expanded={expanded} onToggle={() => setExpandedId(expanded ? null : p.id)} />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          <PlayerMeta p={p} />
          <StatLine p={p} />
        </div>
        {expanded && <ExpandedStats p={p} nav={nav} />}
      </div>
    );
  };

  const renderSection = (title: string, list: Asset[], color: string) => (
    <>
      <div style={{
        fontSize: 9, fontWeight: 900, color,
        letterSpacing: "0.2em", padding: "10px 0 3px",
        textTransform: "uppercase", fontFamily: "monospace",
        borderBottom: `1px solid ${color}40`, marginBottom: 2,
      }}>
        {title} — {list.length}
      </div>
      {list.length === 0 ? (
        <p className="text-[11px] italic py-2" style={{ color: "var(--ledger-brown)" }}>None match.</p>
      ) : list.map(renderRow)}
    </>
  );

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(28,20,10,0.72)",
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, padding: "12px",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-agent-board-title"
        style={{
          background: "var(--paper)",
          border: "1px solid var(--rule)",
          borderTop: "4px double var(--ledger-ink)",
          width: "min(860px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────── */}
        <div style={{
          padding: "14px 20px 10px",
          borderBottom: "1px solid var(--rule)",
          display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9, fontWeight: 900, letterSpacing: "0.5em",
              color: "var(--ledger-ink-faint)", fontFamily: "monospace",
              textTransform: "uppercase", marginBottom: 4,
            }}>
              Cap & Crease · League Intelligence
            </div>
            <div id="free-agent-board-title" style={{
              fontSize: 18, fontWeight: 900, letterSpacing: "0.05em",
              color: "var(--ledger-ink)", fontFamily: "'Libre Baskerville', Georgia, serif",
              lineHeight: 1.1,
            }}>
              Free Agents
            </div>
            <div style={{
              fontSize: 10, color: "var(--ledger-ink-faint)", marginTop: 4,
              fontFamily: "monospace", letterSpacing: "0.05em",
            }}>
              <span style={{ color: "var(--red)", fontWeight: 900 }}>{rfa.length}</span> restricted ·{" "}
              <span style={{ color: "var(--amber)", fontWeight: 900 }}>{ufa.length}</span> unrestricted · browse only
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close free agent board"
            style={{
              background: "transparent", border: "1px solid var(--rule)",
              color: "var(--ledger-ink-faint)", padding: "4px 10px",
              cursor: "pointer", fontSize: 12, fontWeight: 900,
              fontFamily: "monospace",
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Filter bar ────────────────────────────────── */}
        <div style={{
          padding: "8px 20px",
          borderBottom: "1px solid var(--rule-light)",
          display: "flex", gap: 8, alignItems: "center",
          flexWrap: "wrap", flexShrink: 0,
          background: "var(--paper-card)",
        }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search free agents…"
            aria-label="Search free agents"
            style={{
              fontSize: 11, padding: "5px 10px",
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              color: "var(--ledger-ink)", outline: "none",
              minWidth: 150, maxWidth: "100%",
              fontFamily: "monospace",
            }}
          />
          <div style={{ display: "flex", gap: 3 }}>
            {POSITION_TABS.map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                aria-pressed={posFilter === pos}
                style={{
                  fontSize: 9, fontWeight: 900, padding: "4px 8px", cursor: "pointer",
                  letterSpacing: "0.1em", fontFamily: "monospace",
                  background: posFilter === pos ? "var(--ledger-ink)" : "transparent",
                  border: `1px solid ${posFilter === pos ? "var(--ledger-ink)" : "var(--rule)"}`,
                  color: posFilter === pos ? "var(--paper)" : "var(--ledger-ink-faint)",
                }}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable list ───────────────────────────── */}
        <div style={{
          overflowY: "auto", flex: 1, padding: "0 20px 16px",
          scrollbarWidth: "thin", scrollbarColor: "var(--rule) transparent",
        }}>
          {rfa.length === 0 && ufa.length === 0 ? (
            <div style={{
              padding: "40px 0", textAlign: "center",
              color: "var(--ledger-ink-faint)", letterSpacing: "0.2em",
              fontSize: 11, fontFamily: "monospace",
            }}>
              NO FREE AGENTS MATCH
            </div>
          ) : (
            <>
              {renderSection("Restricted Free Agents", rfa, "var(--red)")}
              {renderSection("Unrestricted Free Agents", ufa, "var(--amber)")}
            </>
          )}
        </div>

        {/* ── Footer rule ───────────────────────────────── */}
        <div style={{
          borderTop: "1px solid var(--rule)", padding: "8px 20px",
          flexShrink: 0, background: "var(--paper-card)",
          fontSize: 9, color: "var(--ledger-ink-faint)", fontFamily: "monospace", letterSpacing: "0.1em",
        }}>
          {rfa.length + ufa.length} FREE AGENT{rfa.length + ufa.length !== 1 ? "S" : ""} SHOWN · sign through the Re-Sign phase or the open market
        </div>
      </div>
    </div>
  );
}
