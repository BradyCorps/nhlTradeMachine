"use client";

import React, { useMemo, useState } from "react";
import type { Asset, Team } from "@/app/lib/trade-types";
import { useBodyScrollLock } from "@/app/lib/use-body-scroll-lock";
import { displayPosition } from "@/app/lib/display-position";

interface Props {
  players: Asset[];
  teams:   Team[];
  onSelectTeam: (teamId: string) => void;
  onClose: () => void;
}

const STATUS_CONFIG = {
  requested:   { color: "var(--red)",   bg: "var(--red-dim)",   border: "rgba(166,53,36,0.35)",  label: "REQUESTED"   },
  available:   { color: "var(--amber)",  bg: "var(--amber-dim)", border: "rgba(148,105,20,0.35)", label: "AVAILABLE"   },
  untouchable: { color: "var(--blue)",   bg: "var(--blue-dim)",  border: "rgba(43,63,102,0.35)",  label: "UNTOUCHABLE" },
  auto:        { color: "var(--ledger-ink-faint)", bg: "transparent", border: "var(--rule)",      label: "AUTO"        },
};

// Computer-determined sell candidates — the "what teams could give up" half of
// the trade block. Classic availability profile: veteran on an expiring-ish deal,
// on a team selling (Rebuilding/Tanking/Retooling), real cap hit, not admin-flagged.
function isAutoAvailable(p: Asset, phase: string | undefined): boolean {
  if (p.tradeBlockStatus) return false;
  if (p.position === "Pick") return false;
  const selling = phase === "Rebuilding" || phase === "Tanking" || phase === "Retooling";
  return selling
    && (p.age ?? 0) >= 29
    && (p.yearsRemaining ?? 99) <= 2
    && (p.capHit ?? 0) >= 3;
}

const POSITION_TABS = ["ALL", "C", "W", "D", "G"] as const;
type PosFilter = typeof POSITION_TABS[number];

export default function TradeBlockPanel({ players, teams, onSelectTeam, onClose }: Props) {
  const [posFilter,  setPosFilter]  = useState<PosFilter>("ALL");
  const [showStatus, setShowStatus] = useState<"available_requested" | "all">("available_requested");
  const [search,     setSearch]     = useState("");
  useBodyScrollLock(true);

  const teamMap = useMemo(() =>
    new Map(teams.map(t => [t.id, t])), [teams]);

  const filtered = useMemo(() => {
    const statusSet = showStatus === "available_requested"
      ? new Set(["requested", "available"])
      : new Set(["requested", "available", "untouchable"]);

    return players
      .filter(p => p.position !== "Pick")
      .filter(p => statusSet.has(p.tradeBlockStatus ?? "")
        || isAutoAvailable(p, teamMap.get(p.teamId)?.phase))
      .filter(p => posFilter === "ALL" || p.position === posFilter)
      .filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase())
        || p.teamId.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const rank = (s: string | null | undefined) =>
          s === "requested" ? 0 : s === "available" ? 1 : s === "untouchable" ? 2 : 3;
        const r = rank(a.tradeBlockStatus) - rank(b.tradeBlockStatus);
        if (r !== 0) return r;
        return (b.capHit ?? 0) - (a.capHit ?? 0);
      });
  }, [players, posFilter, showStatus, search, teamMap]);

  const counts = useMemo(() => ({
    requested: players.filter(p => p.tradeBlockStatus === "requested").length,
    available: players.filter(p => p.tradeBlockStatus === "available").length,
  }), [players]);

  const requested   = filtered.filter(p => p.tradeBlockStatus === "requested");
  const available   = filtered.filter(p => p.tradeBlockStatus === "available");
  const untouchable = filtered.filter(p => p.tradeBlockStatus === "untouchable");
  const autoFlagged = filtered.filter(p => !p.tradeBlockStatus);

  const renderPlayer = (p: Asset) => {
    const team = teamMap.get(p.teamId);
    const cfg  = STATUS_CONFIG[(p.tradeBlockStatus ?? "auto") as keyof typeof STATUS_CONFIG];
    if (!cfg) return null;

    return (
      <div
        key={p.id}
        onClick={() => { onSelectTeam(p.teamId); onClose(); }}
        title={`Trade with ${team?.name ?? p.teamId}`}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 48px 28px 56px 38px 90px",
          gap: 6,
          padding: "7px 0",
          borderBottom: "1px solid var(--rule-light)",
          alignItems: "center",
          cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--paper-inset)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ledger-ink)", fontFamily: "'Libre Baskerville', Georgia, serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.name}
          </div>
          {p.tradeBlockNote && (
            <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", marginTop: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.tradeBlockNote}
            </div>
          )}
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: "var(--ledger-ink)", fontFamily: "monospace" }}>{p.teamId}</div>
          <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", fontFamily: "monospace" }}>{team?.phase ?? ""}</div>
        </div>

        <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", textAlign: "center", fontFamily: "monospace" }}>
          {displayPosition(p.position, p.secondaryPosition)}
        </div>

        <div style={{ fontSize: 10, textAlign: "right", fontFamily: "monospace", color: "var(--ledger-ink)" }}>
          ${p.capHit?.toFixed(1)}M
        </div>

        <div style={{ fontSize: 10, textAlign: "center", color: "var(--ledger-ink-faint)", fontFamily: "monospace" }}>
          {p.yearsRemaining}yr
        </div>

        <div style={{ textAlign: "right" }}>
          <span style={{
            fontSize: 10, fontWeight: 900, padding: "2px 5px",
            background: cfg.bg, color: cfg.color,
            border: `1px solid ${cfg.border}`,
            letterSpacing: "0.08em", fontFamily: "monospace",
            whiteSpace: "nowrap",
          }}>
            {cfg.label}
          </span>
        </div>
      </div>
    );
  };

  const renderSection = (title: string, list: Asset[], color: string) => {
    if (list.length === 0) return null;
    return (
      <>
        <div style={{
          fontSize: 9, fontWeight: 900, color,
          letterSpacing: "0.2em", padding: "10px 0 3px",
          textTransform: "uppercase", fontFamily: "monospace",
          borderBottom: `1px solid ${color}40`, marginBottom: 2,
        }}>
          {title} — {list.length}
        </div>
        {list.map(renderPlayer)}
      </>
    );
  };

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
              The Hockey Ledger · League Intelligence
            </div>
            <div style={{
              fontSize: 18, fontWeight: 900, letterSpacing: "0.05em",
              color: "var(--ledger-ink)", fontFamily: "'Libre Baskerville', Georgia, serif",
              lineHeight: 1.1,
            }}>
              Trade Block
            </div>
            <div style={{
              fontSize: 10, color: "var(--ledger-ink-faint)", marginTop: 4,
              fontFamily: "monospace", letterSpacing: "0.05em",
            }}>
              <span style={{ color: "var(--red)", fontWeight: 900 }}>{counts.requested}</span> formal requests ·{" "}
              <span style={{ color: "var(--amber)", fontWeight: 900 }}>{counts.available}</span> available · click player to open trade
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button
              onClick={onClose}
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
            placeholder="Search player or team…"
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

          <button
            onClick={() => setShowStatus(s => s === "available_requested" ? "all" : "available_requested")}
            style={{
              fontSize: 9, fontWeight: 900, padding: "4px 8px", cursor: "pointer",
              letterSpacing: "0.1em", marginLeft: "auto", fontFamily: "monospace",
              background: showStatus === "all" ? "var(--blue-dim)" : "transparent",
              border: `1px solid ${showStatus === "all" ? "var(--blue)" : "var(--rule)"}`,
              color: showStatus === "all" ? "var(--blue)" : "var(--ledger-ink-faint)",
            }}
          >
            {showStatus === "all" ? "HIDE UNTOUCHABLE" : "SHOW UNTOUCHABLE"}
          </button>
        </div>

        {/* ── Column headers ────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 48px 28px 56px 38px 90px",
          gap: 6, padding: "5px 20px",
          borderBottom: "1px solid var(--rule-light)",
          fontSize: 10, color: "var(--ledger-ink-faint)",
          fontWeight: 900, letterSpacing: "0.12em",
          textTransform: "uppercase", fontFamily: "monospace",
          flexShrink: 0, background: "var(--paper-card)",
        }}>
          <div>PLAYER</div>
          <div style={{ textAlign: "center" }}>TEAM</div>
          <div style={{ textAlign: "center" }}>POS</div>
          <div style={{ textAlign: "right" }}>CAP</div>
          <div style={{ textAlign: "center" }}>YRS</div>
          <div style={{ textAlign: "right" }}>STATUS</div>
        </div>

        {/* ── Scrollable list ───────────────────────────── */}
        <div style={{
          overflowY: "auto", flex: 1, padding: "0 20px 16px",
          scrollbarWidth: "thin", scrollbarColor: "var(--rule) transparent",
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: "40px 0", textAlign: "center",
              color: "var(--ledger-ink-faint)", letterSpacing: "0.2em",
              fontSize: 11, fontFamily: "monospace",
            }}>
              NO PLAYERS MATCH
            </div>
          ) : (
            <>
              {renderSection("Formal Trade Requests", requested, "var(--red)")}
              {renderSection("Available / Being Shopped", available, "var(--amber)")}
              {renderSection("Computer Flagged — Likely Sellers", autoFlagged, "var(--ledger-ink-faint)")}
              {renderSection("Untouchable", untouchable, "var(--blue)")}
            </>
          )}
        </div>

        {/* ── Footer rule ───────────────────────────────── */}
        <div style={{
          borderTop: "1px solid var(--rule)", padding: "8px 20px",
          flexShrink: 0, background: "var(--paper-card)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", fontFamily: "monospace", letterSpacing: "0.1em" }}>
            {filtered.length} PLAYER{filtered.length !== 1 ? "S" : ""} SHOWN
          </div>
          <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", fontFamily: "monospace", fontStyle: "italic" }}>
            Click any player to select as trade partner
          </div>
        </div>
      </div>
    </div>
  );
}
