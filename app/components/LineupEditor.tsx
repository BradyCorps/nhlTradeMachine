"use client";
// ── LineupEditor — standalone, editable depth chart panel ──────────────────
// Extracted from the Team Strands section. Shows both teams' post-trade
// lineups (4 F lines, 3 D pairs, 2 G) and lets the user rearrange them:
// click a slot to select it, click another slot (or a bench player) to swap.
// Forwards swap within forwards (C/W flex like real lineups), D within D,
// G within G. Reset restores the ice-time-sorted default.

import React, { useState, useEffect, useMemo, useCallback } from "react";

interface Player {
  id: string;
  name: string;
  position: string;
  secondaryPosition?: string | null;
  avgTOI?: number;
  ptsPace?: number;
  capHit?: number;
  games?: number;
}

type NavLike = { total?: number };

interface TeamProps {
  teamName: string;
  label?: string;
  roster: Player[];      // roster before the active move is applied
  outgoing: Player[];    // leaving in the active trade
  incoming: Player[];    // arriving in the active trade
  navMap?: Record<string, NavLike>;
}

interface Props {
  home: TeamProps | null;
  partner: TeamProps | null;
  hasActiveTrade: boolean;
  navMap?: Record<string, NavLike>;
}

const MONO = "'Courier Prime', monospace";

const abbr = (name: string) => {
  const parts = name.split(" ");
  if (parts.length < 2) return name.slice(0, 12);
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`.slice(0, 15);
};

const sortByIce = (ps: Player[]) =>
  [...ps].sort((a, b) => (b.avgTOI ?? b.ptsPace ?? 0) - (a.avgTOI ?? a.ptsPace ?? 0));
const sortByGames = (ps: Player[]) =>
  [...ps].sort((a, b) => (b.games ?? 0) - (a.games ?? 0));

const isC = (p: Player) => p.position === "C";
const isW = (p: Player) =>
  ["W", "L", "R", "LW", "RW"].includes(p.position) || p.secondaryPosition === "W";
const isF = (p: Player) => isC(p) || isW(p);
const isD = (p: Player) => p.position === "D";
const isG = (p: Player) => p.position === "G";

type Group = "F" | "D" | "G";
const SLOT_COUNT: Record<Group, number> = { F: 12, D: 6, G: 2 };

// Default ordering: centers fill the C column (idx 1,4,7,10), wingers the
// wings — flattened to a single array so swaps are simple index exchanges.
function defaultOrder(effective: Player[], group: Group): string[] {
  if (group === "D") return sortByIce(effective.filter(isD)).map(p => p.id);
  if (group === "G") return sortByGames(effective.filter(isG)).map(p => p.id);

  const centers   = sortByIce(effective.filter(isC));
  const wingers   = sortByIce(effective.filter(p => isW(p) && !isC(p)));
  const topC      = centers.slice(0, 4);
  const flexC     = centers.slice(4);
  const wingPool  = sortByIce([...wingers, ...flexC]);

  const order: (string | null)[] = new Array(12).fill(null);
  topC.forEach((p, i) => { order[i * 3 + 1] = p.id; });     // C column
  let w = 0;
  for (let i = 0; i < 12 && w < wingPool.length; i++) {
    if (order[i] === null) order[i] = wingPool[w++].id;     // LW/RW columns
  }
  const placed = new Set(order.filter(Boolean) as string[]);
  const bench  = effective.filter(p => isF(p) && !placed.has(p.id)).map(p => p.id);
  return [...(order.filter(Boolean) as string[]), ...bench];
}

const STATUS_COLOR = {
  normal: "var(--ledger-ink)",
  in:     "#2a7a44",
  empty:  "var(--ledger-ink-faint)",
} as const;

const navOf = (p: Player | undefined, navMap?: Record<string, NavLike>) =>
  p ? Math.round(navMap?.[p.id]?.total ?? 0) : 0;

const navColor = (nav: number) =>
  nav >= 160 ? "var(--ledger-ink)"
  : nav >= 50 ? "#2a5a8f"
  : nav >= 0 ? "#7a5a20"
  : "#b83020";

function TeamLineup({ teamName, label, roster, outgoing, incoming, navMap }: TeamProps) {
  const outIds = useMemo(() => new Set(outgoing.map(p => p.id)), [outgoing]);
  const inIds  = useMemo(() => new Set(incoming.map(p => p.id)), [incoming]);

  // Post-trade effective roster — the thing being arranged
  const effective = useMemo(() => [
    ...roster.filter(p => !outIds.has(p.id)),
    ...incoming.filter(p => p.position !== "Pick"),
  ], [roster, incoming, outIds]);

  const byId = useMemo(() => new Map(effective.map(p => [p.id, p])), [effective]);

  // Roster fingerprint — re-init orders when the trade or roster changes
  const rosterKey = useMemo(
    () => effective.map(p => p.id).sort().join("|"),
    [effective]
  );

  const [orders, setOrders] = useState<Record<Group, string[]>>({ F: [], D: [], G: [] });
  const [edited, setEdited] = useState(false);
  const [selected, setSelected] = useState<{ group: Group; idx: number } | null>(null);

  useEffect(() => {
    setOrders({
      F: defaultOrder(effective, "F"),
      D: defaultOrder(effective, "D"),
      G: defaultOrder(effective, "G"),
    });
    setEdited(false);
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey]);

  const reset = useCallback(() => {
    setOrders({
      F: defaultOrder(effective, "F"),
      D: defaultOrder(effective, "D"),
      G: defaultOrder(effective, "G"),
    });
    setEdited(false);
    setSelected(null);
  }, [effective]);

  const clickSlot = useCallback((group: Group, idx: number) => {
    setSelected(prev => {
      if (!prev) return { group, idx };
      if (prev.group === group && prev.idx === idx) return null;   // deselect
      if (prev.group !== group) return { group, idx };             // switch selection
      // Swap within group (swapping with an empty slot just moves the player)
      setOrders(o => {
        const arr = [...o[group]];
        if (arr[prev.idx] === undefined && arr[idx] === undefined) return o;
        [arr[prev.idx], arr[idx]] = [arr[idx], arr[prev.idx]];
        return { ...o, [group]: arr };
      });
      setEdited(true);
      return null;
    });
  }, []);

  const Cell = ({ group, idx, pos }: { group: Group; idx: number; pos: string }) => {
    const id = orders[group][idx];
    const p  = id ? byId.get(id) : undefined;
    const isSel = selected?.group === group && selected.idx === idx;
    const status: keyof typeof STATUS_COLOR = !p ? "empty" : inIds.has(p.id) ? "in" : "normal";
    const nav = navOf(p, navMap);
    const meta = p
      ? p.position === "G"
        ? `${p.games ?? 0} GP`
        : `${Math.round(p.ptsPace ?? 0)} P82 · ${(p.avgTOI ?? 0).toFixed(1)} TOI`
      : "";
    return (
      <td
        onClick={() => clickSlot(group, idx)}
        title={p ? `${p.name} · ${p.position} · NAV ${nav}` : "Empty lineup slot"}
        style={{
          padding: 3, fontFamily: MONO,
          color: STATUS_COLOR[status],
          cursor: "pointer", userSelect: "none",
          verticalAlign: "top",
        }}
      >
        <div style={{
          minHeight: 50,
          border: isSel ? "1px solid #a08020" : "1px solid rgba(184,160,112,0.7)",
          background: isSel ? "rgba(180,140,40,0.20)" : p ? "rgba(255,255,255,0.20)" : "rgba(184,160,112,0.12)",
          padding: "6px 7px",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          gap: 3,
          boxShadow: isSel ? "inset 0 0 0 1px rgba(160,128,32,0.35)" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5 }}>
            <span style={{
              fontSize: 11, fontWeight: 900, color: "var(--ledger-ink-faint)",
              letterSpacing: 0,
            }}>{pos.trim()}</span>
            {p && (
              <span style={{
                fontSize: 11, fontWeight: 900, color: navColor(nav),
                whiteSpace: "nowrap",
              }}>NAV {nav}</span>
            )}
          </div>
          <div style={{
            fontSize: 11,
            lineHeight: 1.12,
            fontWeight: status === "in" ? 900 : status === "normal" ? 800 : 500,
            color: STATUS_COLOR[status],
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflowWrap: "anywhere",
          }}>
            {p ? p.name : "Empty"}
            {status === "in" && <span style={{ fontSize: 11, marginLeft: 4, color: "#2a7a44" }}>▲</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5 }}>
            <span style={{
              fontSize: 11, fontWeight: 900, color: p ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
              border: "1px solid rgba(184,160,112,0.8)", padding: "0 4px", lineHeight: "13px",
              minWidth: 20, textAlign: "center",
            }}>{p?.position ?? "--"}</span>
            <span style={{ fontSize: 11, color: "var(--ledger-ink-faint)", whiteSpace: "nowrap" }}>{meta}</span>
          </div>
        </div>
      </td>
    );
  };

  const SectionHead = ({ children }: { children: React.ReactNode }) => (
    <tr>
      <td colSpan={4} style={{
        fontFamily: MONO, fontSize: 11, fontWeight: 900, color: "var(--ledger-ink-faint)",
        textTransform: "uppercase", letterSpacing: 0, paddingTop: 6, paddingBottom: 2,
        borderBottom: "1px solid #c8b890",
      }}>
        {children}
      </td>
    </tr>
  );

  const RowLabel = ({ text }: { text: string }) => (
    <td style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900,
                 color: "var(--ledger-ink-faint)", paddingRight: 4, whiteSpace: "nowrap", width: 36 }}>
      {text}
    </td>
  );

  const ordinals = ["1st", "2nd", "3rd", "4th"];
  const fBench = orders.F.slice(12);
  const dBench = orders.D.slice(6);
  const benchIds = [...fBench.map((id, i) => ({ id, group: "F" as Group, idx: 12 + i })),
                    ...dBench.map((id, i) => ({ id, group: "D" as Group, idx: 6 + i }))];

  return (
    <div style={{ fontFamily: MONO }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "var(--ledger-ink)", letterSpacing: 0 }}>
          {teamName}
          {label && <span style={{ color: "var(--ledger-ink-faint)", fontWeight: 400 }}> — {label}</span>}
        </div>
        {edited && (
          <button onClick={reset} style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: 0,
            color: "#b83020", background: "none", border: "1px solid #b83020",
            padding: "1px 6px", cursor: "pointer", textTransform: "uppercase",
          }}>
            Reset
          </button>
        )}
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <tbody>
          <SectionHead>Forwards</SectionHead>
          {[0, 1, 2, 3].map(i => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--ledger-cream)" }}>
              <RowLabel text={ordinals[i]} />
              <Cell group="F" idx={i * 3}     pos="LW" />
              <Cell group="F" idx={i * 3 + 1} pos="C " />
              <Cell group="F" idx={i * 3 + 2} pos="RW" />
            </tr>
          ))}

          <SectionHead>Defense</SectionHead>
          {[0, 1, 2].map(i => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--ledger-cream)" }}>
              <RowLabel text={ordinals[i]} />
              <Cell group="D" idx={i * 2}     pos="LD" />
              <Cell group="D" idx={i * 2 + 1} pos="RD" />
              <td />
            </tr>
          ))}

          <SectionHead>Goaltending</SectionHead>
          <tr>
            <RowLabel text="STR" />
            <Cell group="G" idx={0} pos="G " />
            <td colSpan={2} />
          </tr>
          <tr>
            <RowLabel text="BAK" />
            <Cell group="G" idx={1} pos="G " />
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>

      {/* Bench — extra skaters; click one, then click a lineup slot to insert */}
      {benchIds.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 6, fontWeight: 900, color: "var(--ledger-ink-faint)",
                        textTransform: "uppercase", letterSpacing: 0, marginBottom: 3 }}>
            Bench / Scratches
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {benchIds.map(({ id, group, idx }) => {
              const p = byId.get(id);
              if (!p) return null;
              const isSel = selected?.group === group && selected.idx === idx;
              const nav = navOf(p, navMap);
              return (
                <span key={id} onClick={() => clickSlot(group, idx)}
                  title={`${p.name} · ${p.position} · NAV ${nav}`}
                  style={{
                    fontFamily: MONO, fontSize: 11, fontWeight: 800, cursor: "pointer",
                    padding: "4px 7px", border: "1px solid #c8b890", userSelect: "none",
                    color: inIds.has(id) ? "#2a7a44" : "var(--ledger-ink)",
                    background: isSel ? "rgba(180,140,40,0.25)" : "var(--ledger-cream)",
                    outline: isSel ? "1px dashed #a08020" : "none",
                  }}>
                  {abbr(p.name)}
                  <span style={{ fontSize: 11, opacity: 0.65, marginLeft: 5 }}>{p.position}</span>
                  <span style={{ fontSize: 11, color: navColor(nav), marginLeft: 5 }}>NAV {nav}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Departing players (read-only) */}
      {outgoing.filter(p => p.position !== "Pick").length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, fontSize: 11 }}>
          <span style={{ color: "#b83020", fontWeight: 900 }}>▼ departing:</span>
          {outgoing.filter(p => p.position !== "Pick").map(p => (
            <span key={p.id} style={{ color: "#b83020", textDecoration: "line-through" }}>{abbr(p.name)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LineupEditor({ home, partner, hasActiveTrade, navMap }: Props) {
  const [expanded, setExpanded] = useState(true);
  if (!home && !partner) return null;

  return (
    <div className="strands-panel">
      <button className="strands-header" onClick={() => setExpanded(e => !e)}>
        <div className="strands-header-left">
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
            <rect x="0" y="1"  width="16" height="2.2" fill="var(--blue)" opacity="0.9" />
            <rect x="0" y="5"  width="16" height="2.2" fill="var(--blue)" opacity="0.6" />
            <rect x="0" y="9"  width="10" height="2.2" fill="var(--red)"  opacity="0.8" />
          </svg>
          <span className="strands-title">Lineups</span>
          {hasActiveTrade && <span className="strands-post-trade-badge">Post-Trade</span>}
        </div>
        <div className="strands-header-right">
          <span className="data-label">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="strands-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(430px, 100%), 1fr))", gap: 12 }}>
            {home && (
              <div style={{ background: "var(--ledger-cream)", border: "1px solid #c8b890", padding: "10px 12px" }}>
                <TeamLineup {...home} navMap={navMap} />
              </div>
            )}
            {partner && (
              <div style={{ background: "var(--ledger-cream)", border: "1px solid #c8b890", padding: "10px 12px" }}>
                <TeamLineup {...partner} navMap={navMap} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
