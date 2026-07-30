"use client";
// ── LineupEditor — standalone, editable depth chart panel ──────────────────
// Extracted from the Team Strands section. Shows both teams' post-trade
// lineups (4 F lines, 3 D pairs, 2 G) and lets the user rearrange them:
// click a slot to select it, click another slot (or a bench player) to swap.
// Forwards swap within forwards (C/W flex like real lineups), D within D,
// G within G. Reset restores the ice-time-sorted default.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { displayPosition } from "@/app/lib/display-position";
import { teamLeadership, letterFor } from "@/app/lib/team-leadership";
import {
  applyLocks, emptyLineupLocks, isLocked, lockCount, pruneAllLocks, swapLocks, toggleLock,
  type LineupLocks,
} from "@/app/lib/lineup-locks";
import { lineupContributionScore } from "@/app/lib/lineup-ranking";
import {
  defaultSpecialTeams, emptySpecialTeams, hydrateSpecialTeams,
  PK_SLOTS, PK_UNIT_SIZE, PP_SLOTS, PP_UNIT_SIZE,
  type SpecialTeamsOrder, type SpecialTeamsSituation,
} from "@/app/lib/special-teams";
import {
  defaultLineupOrdersForRoster,
  hydrateLineupOrdersForRoster,
  sameLineupGroupOrders,
  isC, isW, isF, isD, isG,
  type LineupGroupOrders,
  type LineupOrderPayload,
  type LineupPlayer as Player,
} from "@/app/lib/lineup-order";

export { hydrateLineupOrdersForRoster };
export type { LineupOrderPayload, Player };

type NavLike = { total?: number };

interface TeamProps {
  teamId: string;
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
  savedLineupOrders?: Record<string, LineupOrderPayload>;
  onGoalieStarterChange?: (teamId: string, goalieId: string | null) => void;
  onLineupChange?: (teamId: string, order: LineupOrderPayload) => void;
}

const MONO = "'Courier Prime', monospace";

const abbr = (name: string) => {
  const parts = name.split(" ");
  if (parts.length < 2) return name.slice(0, 12);
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`.slice(0, 15);
};

const sortByGames = (ps: Player[]) =>
  [...ps].sort((a, b) => (b.games ?? 0) - (a.games ?? 0));

// Position eligibility (isC/isW/isF/isD/isG) is imported from lineup-order
// so the editor and the default-ordering engine honor alternate positions
// (AG3) identically — one source of truth, no drift.

type Group = "F" | "D" | "G";
const SLOT_COUNT: Record<Group, number> = { F: 12, D: 6, G: 2 };

// Ordering engine: centers fill the C column (idx 1,4,7,10), wingers the
// wings — flattened to a single array so swaps are simple index exchanges.
// The ranker decides who plays up: ice time by default, lineup contribution
// for Best Lines.
function buildOrder(
  effective: Player[],
  group: Group,
  rankSort: (ps: Player[]) => Player[],
  goalieSort: (ps: Player[]) => Player[] = sortByGames,
): string[] {
  if (group === "D") return rankSort(effective.filter(isD)).map(p => p.id);
  if (group === "G") return goalieSort(effective.filter(isG)).map(p => p.id);

  const centers   = rankSort(effective.filter(isC));
  const wingers   = rankSort(effective.filter(p => isW(p) && !isC(p)));
  const topC      = centers.slice(0, 4);
  const flexC     = centers.slice(4);
  const wingPool  = rankSort([...wingers, ...flexC]);

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

function TeamLineup({
  teamId,
  teamName,
  label,
  roster,
  outgoing,
  incoming,
  navMap,
  savedOrder,
  onGoalieStarterChange,
  onLineupChange,
}: TeamProps & Pick<Props, "onGoalieStarterChange" | "onLineupChange"> & { savedOrder?: LineupOrderPayload }) {
  const outIds = useMemo(() => new Set(outgoing.map(p => p.id)), [outgoing]);
  const inIds  = useMemo(() => new Set(incoming.map(p => p.id)), [incoming]);

  // Post-trade effective roster — the thing being arranged
  const effective = useMemo(() => [
    ...roster.filter(p => !outIds.has(p.id)),
    ...incoming.filter(p => p.position !== "Pick"),
  ], [roster, incoming, outIds]);

  const byId = useMemo(() => new Map(effective.map(p => [p.id, p])), [effective]);

  // RL4 — the letters. Ranked by the same contribution score the lineup itself
  // orders on, so when a roster carries more than two curated alternates the
  // two that dress are the two nearest the top of the sheet.
  const leadership = useMemo(
    () => teamLeadership(effective, candidate => {
      const player = candidate.id ? byId.get(candidate.id) : undefined;
      return player ? lineupContributionScore(player, navMap?.[player.id]?.total) : 0;
    }),
    [effective, byId, navMap],
  );

  // A lock that outlives its player would re-seat whoever inherits that slot
  // and is invisible in the UI — there is no player on it to show a badge.
  useEffect(() => {
    setLocks(prev => pruneAllLocks(prev, effective.map(p => p.id)));
  }, [effective]);

  // Units survive a trade the same way the 5-on-5 sheet does: departed players
  // drop out, the gap closes, and the defaults fill what is left — a unit with
  // a hole in it would silently play short.
  useEffect(() => {
    setSpecialTeams(prev => hydrateSpecialTeams(effective, prev));
  }, [effective]);

  // Roster fingerprint — re-init orders when the trade or roster changes
  const rosterKey = useMemo(
    () => effective.map(p => p.id).sort().join("|"),
    [effective]
  );

  const initialOrders = useMemo(() => hydrateLineupOrdersForRoster(effective, savedOrder), [effective, savedOrder]);
  const initialEdited = useMemo(() => !sameLineupGroupOrders(initialOrders, defaultLineupOrdersForRoster(effective)), [effective, initialOrders]);

  const [orders, setOrders] = useState<LineupGroupOrders>(() => initialOrders);
  const [edited, setEdited] = useState(initialEdited);
  const [selected, setSelected] = useState<{ group: Group; idx: number } | null>(null);
  // RL5 — line locks. A lock pins one player to one slot so the automatic
  // re-order that follows every trade/signing/rollover cannot reflow the one
  // placement the user deliberately made.
  const [locks, setLocks] = useState<LineupLocks>(emptyLineupLocks);
  // RL6 — which situation the sheet is showing. Even strength is the existing
  // grid; PP and PK are unit sheets over the same roster.
  const [situation, setSituation] = useState<SpecialTeamsSituation>("EV");
  const [specialTeams, setSpecialTeams] = useState<SpecialTeamsOrder>(emptySpecialTeams);
  const [stSelected, setStSelected] = useState<{ sheet: "PP" | "PK"; idx: number } | null>(null);
  // A player picked off the special-teams bench, waiting for a slot to land in.
  // Distinct from `stSelected`, which is a slot-to-slot swap: a bench player is
  // not on the sheet at all, so there is no index to swap with.
  const [stBenchPick, setStBenchPick] = useState<string | null>(null);
  const editedRef = useRef(false);
  useEffect(() => { editedRef.current = edited; }, [edited]);

  // Read through a ref so re-seating never has to list `locks` as a dependency
  // — the roster effect must fire on roster identity, not on every lock toggle.
  const locksRef = useRef(locks);
  useEffect(() => { locksRef.current = locks; }, [locks]);
  const seatLocks = useCallback((next: LineupGroupOrders): LineupGroupOrders => {
    const current = locksRef.current;
    return {
      F: applyLocks(next.F, current.F),
      D: applyLocks(next.D, current.D),
      G: applyLocks(next.G, current.G),
    };
  }, []);

  useEffect(() => {
    setOrders(prev => {
      const hadOrders = prev.F.length + prev.D.length + prev.G.length > 0;
      // Hand-set lineups are locked through trades: keep the user's order,
      // drop departed players, slot arrivals onto the bench/end instead of
      // resetting the whole sheet.
      if (hadOrders && editedRef.current) {
        const ids = new Set(effective.map(p => p.id));
        const merge = (arr: string[], belongs: (p: Player) => boolean) => {
          const kept = arr.filter(id => ids.has(id));
          const present = new Set(kept);
          const adds = effective.filter(p => belongs(p) && !present.has(p.id)).map(p => p.id);
          return [...kept, ...adds];
        };
        return seatLocks({ F: merge(prev.F, isF), D: merge(prev.D, isD), G: merge(prev.G, isG) });
      }
      // Even a full rebuild honours locks — the whole point is that a roster
      // change cannot move a player the user pinned.
      return seatLocks(defaultLineupOrdersForRoster(effective));
    });
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey]);

  useEffect(() => {
    onGoalieStarterChange?.(teamId, orders.G[0] ?? null);
  }, [teamId, orders.G, onGoalieStarterChange]);

  useEffect(() => {
    onLineupChange?.(teamId, {
      forwards: orders.F.slice(0, 12),
      defense: orders.D.slice(0, 6),
      goalies: orders.G.slice(0, 2),
      scratches: [
        ...orders.F.slice(12),
        ...orders.D.slice(6),
        ...orders.G.slice(2),
      ],
      powerPlay: specialTeams.powerPlay,
      penaltyKill: specialTeams.penaltyKill,
    });
  }, [teamId, orders, specialTeams, onLineupChange]);

  const reset = useCallback(() => {
    setOrders(defaultLineupOrdersForRoster(effective));
    setEdited(false);
    setSelected(null);
    // Reset means "back to the default sheet". Keeping locks would leave the
    // sheet neither default nor the user's, which is the worst of both.
    setLocks(emptyLineupLocks());
    setSpecialTeams(defaultSpecialTeams(effective));
    setStSelected(null);
  }, [effective]);

  // Best Lines: order every unit by lineup contribution. X-NAV is contract-
  // weighted asset value, so it is only a light tiebreaker here; production,
  // deployment trust, matchup roles, and NHL tenure drive who plays up.
  // Counts as an edit so it locks through subsequent trades.
  const bestLines = useCallback(() => {
    const onIceRank = (pl: Player) => {
      const nav = navMap?.[pl.id]?.total;
      return lineupContributionScore(pl, nav);
    };
    const byNav = (ps: Player[]) => [...ps].sort((a, b) => onIceRank(b) - onIceRank(a));
    const goalieByNav = (ps: Player[]) =>
      [...ps].sort((a, b) =>
        (navMap?.[b.id]?.total ?? b.games ?? 0) - (navMap?.[a.id]?.total ?? a.games ?? 0));
    setOrders(seatLocks({
      F: buildOrder(effective, "F", byNav),
      D: buildOrder(effective, "D", byNav),
      G: buildOrder(effective, "G", byNav, goalieByNav),
    }));
    setEdited(true);
    setSelected(null);
  }, [effective, navMap, seatLocks]);

  // CXH2 — this used to perform the swap INSIDE a `setSelected` updater.
  // A state updater must be pure: React StrictMode double-invokes it in
  // development, so the swap, the lock move and the edited flag all fired
  // twice, and a double swap is a no-op — the bug hid itself.
  const clickSlot = useCallback((group: Group, idx: number) => {
    if (!selected) { setSelected({ group, idx }); return; }
    if (selected.group === group && selected.idx === idx) { setSelected(null); return; }
    if (selected.group !== group) { setSelected({ group, idx }); return; }

    const from = selected.idx;
    setOrders(o => {
      const arr = [...o[group]];
      if (arr[from] === undefined && arr[idx] === undefined) return o;
      [arr[from], arr[idx]] = [arr[idx], arr[from]];
      return { ...o, [group]: arr };
    });
    // The lock follows the player, not the slot — otherwise a manual move
    // is silently undone the next time the sheet re-hydrates.
    setLocks(l => ({ ...l, [group]: swapLocks(l[group], from, idx) }));
    setEdited(true);
    setSelected(null);
  }, [selected]);

  // Reads `orders` directly rather than calling setLocks inside a setOrders
  // updater — a state update nested in another updater is a side effect in a
  // reducer, which StrictMode double-invokes and CXH2 flags elsewhere.
  const totalLocks = lockCount(locks);

  const toggleSlotLock = useCallback((group: Group, idx: number) => {
    const playerId = orders[group][idx];
    if (!playerId) return;
    setLocks(l => ({ ...l, [group]: toggleLock(l[group], idx, playerId) }));
    setEdited(true);
  }, [orders]);

  const keySlot = useCallback((event: React.KeyboardEvent, group: Group, idx: number) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    clickSlot(group, idx);
  }, [clickSlot]);

  // CXH2 — a render HELPER, not a component declared in render.
  //
  // As `const Cell = (...) => ...` this was a brand-new component type on every
  // render, so React could not match the old tree to the new one and unmounted
  // and remounted all 18 cells for any state change — including the `selected`
  // change a click makes. That threw away focus mid-interaction, which is
  // exactly what the CXH8 keyboard work was for. Called as a function, React
  // sees the returned <td> elements as children of this component and reconciles
  // them normally.
  const renderCell = (group: Group, idx: number, pos: string) => {
    const id = orders[group][idx];
    const p  = id ? byId.get(id) : undefined;
    const isSel = selected?.group === group && selected.idx === idx;
    const status: keyof typeof STATUS_COLOR = !p ? "empty" : inIds.has(p.id) ? "in" : "normal";
    const nav = navOf(p, navMap);
    const letter = letterFor(p?.name, leadership);
    const slotLocked = isLocked(locks[group], idx, p?.id);
    // RL8 — G and A, not a P/82 rate. A per-82 projection is the right unit
    // for comparing players across different games-played totals, but a lineup
    // card is asking "who is this winger", and counting stats answer that in
    // the language the rest of the sport uses. `goalsPace`/`assistsPace` are
    // the same 82-game basis `ptsPace` was, so the row still totals to it.
    const meta = p
      ? p.position === "G"
        ? `${p.games ?? 0} GP`
        : `${Math.round(p.goalsPace ?? 0)}G · ${Math.round(p.assistsPace ?? 0)}A · ${(p.avgTOI ?? 0).toFixed(1)} TOI`
      : "";
    return (
      <td
        onClick={() => clickSlot(group, idx)}
        onKeyDown={(event) => keySlot(event, group, idx)}
        role="button"
        tabIndex={0}
        aria-label={p
          ? `Select ${p.name}${letter === "C" ? ", captain" : letter === "A" ? ", alternate captain" : ""}${slotLocked ? ", locked to this slot" : ""} in ${pos.trim()} slot`
          : `Select empty ${pos.trim()} slot`}
        title={p ? `${p.name} · ${displayPosition(p.position, p.secondaryPosition)} · NAV ${nav}` : "Empty lineup slot"}
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
          overflow: "hidden",
          boxShadow: isSel ? "inset 0 0 0 1px rgba(160,128,32,0.35)" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, minWidth: 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 900, color: "var(--ledger-ink-faint)",
              letterSpacing: 0, flexShrink: 0,
            }}>{pos.trim()}</span>
            {p && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                <span style={{
                  fontSize: 9, fontWeight: 900, color: navColor(nav),
                  whiteSpace: "nowrap",
                }}>NAV {nav}</span>
                <button
                  type="button"
                  className="tap-target"
                  onClick={(event) => { event.stopPropagation(); toggleSlotLock(group, idx); }}
                  aria-pressed={slotLocked}
                  aria-label={`${slotLocked ? "Unlock" : "Lock"} ${p.name} to this slot`}
                  title={slotLocked
                    ? `${p.name} is locked here — auto-ordering will not move him`
                    : `Lock ${p.name} to this slot`}
                  style={{
                    background: "none", border: "none", padding: "0 1px", cursor: "pointer",
                    fontSize: 9, lineHeight: "12px",
                    color: slotLocked ? "var(--ledger-red)" : "var(--ledger-rule)",
                    fontWeight: 900,
                  }}>
                  {slotLocked ? "\u25C6" : "\u25C7"}
                </button>
              </span>
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
            {letter && (
              <span
                title={letter === "C" ? "Captain" : "Alternate captain"}
                style={{
                  fontSize: 8, fontWeight: 900, marginLeft: 4,
                  border: "1px solid var(--ledger-ink-faint)", padding: "0 3px",
                  lineHeight: "12px", verticalAlign: "middle",
                  color: "var(--ledger-ink)",
                }}>{letter}</span>
            )}
            {status === "in" && <span style={{ fontSize: 11, marginLeft: 4, color: "#2a7a44" }}>▲</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, minWidth: 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 900, color: p ? "var(--ledger-ink)" : "var(--ledger-ink-faint)",
              border: "1px solid rgba(184,160,112,0.8)", padding: "0 4px", lineHeight: "13px",
              minWidth: 18, textAlign: "center", flexShrink: 0,
            }}>{p ? displayPosition(p.position, p.secondaryPosition) : "--"}</span>
            <span style={{
              fontSize: 9, color: "var(--ledger-ink-faint)", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
            }}>{meta}</span>
          </div>
        </div>
      </td>
    );
  };

  // ── Special-teams sheets (RL6) ──────────────────────────────
  // The same click-to-swap idiom as the 5-on-5 grid, over a flat id list.
  // A player already on the sheet is moved rather than duplicated — a unit
  // cannot dress the same man twice.
  const clickUnitSlot = useCallback((sheet: "PP" | "PK", idx: number) => {
    if (!stSelected) { setStSelected({ sheet, idx }); return; }
    if (stSelected.sheet === sheet && stSelected.idx === idx) { setStSelected(null); return; }
    if (stSelected.sheet !== sheet) { setStSelected({ sheet, idx }); return; }

    const from = stSelected.idx;
    setSpecialTeams(st => {
      const key = sheet === "PP" ? "powerPlay" : "penaltyKill";
      const slots = sheet === "PP" ? PP_SLOTS : PK_SLOTS;
      const arr = [...st[key]];
      while (arr.length < slots) arr.push("");
      [arr[from], arr[idx]] = [arr[idx], arr[from]];
      return { ...st, [key]: arr };
    });
    setEdited(true);
    setStSelected(null);
  }, [stSelected]);

  // Put the pending bench player into this slot. Whoever was there returns to
  // the bench, which is what makes the sheet editable at all — before this the
  // only reachable players were the ones hydrate happened to place.
  const placeFromBench = useCallback((sheet: "PP" | "PK", idx: number, playerId: string) => {
    setSpecialTeams(st => {
      const key = sheet === "PP" ? "powerPlay" : "penaltyKill";
      const slots = sheet === "PP" ? PP_SLOTS : PK_SLOTS;
      const arr = [...st[key]];
      while (arr.length < slots) arr.push("");
      // A unit cannot dress the same man twice: if he is already on this sheet,
      // vacate that slot as he moves.
      const existing = arr.indexOf(playerId);
      if (existing >= 0) arr[existing] = arr[idx];
      arr[idx] = playerId;
      return { ...st, [key]: arr };
    });
    setEdited(true);
    setStBenchPick(null);
    setStSelected(null);
  }, []);

  const renderUnitCell = (sheet: "PP" | "PK", idx: number, key: React.Key) => {
    const ids = sheet === "PP" ? specialTeams.powerPlay : specialTeams.penaltyKill;
    const id = ids[idx];
    const p = id ? byId.get(id) : undefined;
    const isSel = stSelected?.sheet === sheet && stSelected.idx === idx;
    const nav = navOf(p, navMap);

    return (
      <td
        key={key}
        onClick={() => (stBenchPick ? placeFromBench(sheet, idx, stBenchPick) : clickUnitSlot(sheet, idx))}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (stBenchPick) placeFromBench(sheet, idx, stBenchPick); else clickUnitSlot(sheet, idx);
        }}
        role="button"
        tabIndex={0}
        aria-label={p ? `Select ${p.name} on ${sheet} unit` : `Select empty ${sheet} slot`}
        style={{ padding: 3, fontFamily: MONO, cursor: "pointer", userSelect: "none", verticalAlign: "top" }}
      >
        <div style={{
          minHeight: 38,
          border: isSel ? "1px solid #a08020" : "1px solid rgba(184,160,112,0.7)",
          background: isSel ? "rgba(180,140,40,0.20)" : p ? "rgba(255,255,255,0.20)" : "rgba(184,160,112,0.12)",
          padding: "5px 6px",
          display: "grid",
          gap: 2,
          overflow: "hidden",
        }}>
          <div style={{ fontSize: 10.5, fontWeight: p ? 800 : 500, lineHeight: 1.15, overflowWrap: "anywhere" }}>
            {p ? p.name : "Empty"}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: "var(--ledger-ink-faint)" }}>
              {p ? displayPosition(p.position, p.secondaryPosition) : "--"}
            </span>
            {p && (
              <span style={{ fontSize: 9, fontWeight: 900, color: navColor(nav) }}>NAV {nav}</span>
            )}
          </div>
        </div>
      </td>
    );
  };

  const renderUnitSheet = (sheet: "PP" | "PK") => {
    const unitSize = sheet === "PP" ? PP_UNIT_SIZE : PK_UNIT_SIZE;
    const label = sheet === "PP" ? "Power Play" : "Penalty Kill";
    return (
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <tbody>
          {[0, 1].map(unit => (
            <React.Fragment key={unit}>
              {renderSectionHead(`${label} — Unit ${unit + 1}`)}
              <tr style={{ background: unit % 2 === 0 ? "transparent" : "var(--ledger-cream)" }}>
                {Array.from({ length: unitSize }, (_, i) =>
                  renderUnitCell(sheet, unit * unitSize + i, i))}
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    );
  };

  const renderSectionHead = (children: React.ReactNode) => (
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

  const renderRowLabel = (text: string) => (
    <td style={{ fontFamily: MONO, fontSize: 11, fontWeight: 900,
                 color: "var(--ledger-ink-faint)", paddingRight: 4, whiteSpace: "nowrap", width: 36 }}>
      {text}
    </td>
  );

  // Everyone eligible for this special-teams sheet who is not already on it.
  // Skaters only — a goaltender does not take a power-play shift.
  const stBenchPlayers = useMemo(() => {
    if (situation === "EV") return [];
    const onSheet = new Set(
      (situation === "PP" ? specialTeams.powerPlay : specialTeams.penaltyKill).filter(Boolean));
    return effective
      .filter(p => !isG(p) && !onSheet.has(p.id))
      .sort((a, b) => lineupContributionScore(b, navMap?.[b.id]?.total)
        - lineupContributionScore(a, navMap?.[a.id]?.total));
  }, [situation, specialTeams, effective, navMap]);

  const ordinals = ["1st", "2nd", "3rd", "4th"];
  const fBench = orders.F.slice(12);
  const dBench = orders.D.slice(6);
  const gBench = orders.G.slice(2);
  const benchIds = [...fBench.map((id, i) => ({ id, group: "F" as Group, idx: 12 + i })),
                    ...dBench.map((id, i) => ({ id, group: "D" as Group, idx: 6 + i })),
                    ...gBench.map((id, i) => ({ id, group: "G" as Group, idx: 2 + i }))];

  return (
    <div style={{ fontFamily: MONO }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "var(--ledger-ink)", letterSpacing: 0 }}>
          {teamName}
          {label && <span style={{ color: "var(--ledger-ink-faint)", fontWeight: 400 }}> — {label}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {totalLocks > 0 && (
            <span
              aria-live="polite"
              title="Locked players keep their slot when the lineup re-orders"
              style={{
                fontSize: 10, fontWeight: 900, letterSpacing: "0.1em",
                color: "var(--ledger-red)", textTransform: "uppercase",
              }}>
              {"\u25C6"} {totalLocks} locked
            </span>
          )}
          <button onClick={bestLines} title="Order every unit by lineup contribution" className="tap-target" style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: 0,
            color: "#2a5a8f", background: "none", border: "1px solid #2a5a8f",
            padding: "1px 10px", cursor: "pointer", textTransform: "uppercase",
          }}>
            Best Lines
          </button>
          {edited && (
            <button onClick={reset} className="tap-target" style={{
              fontFamily: MONO, fontSize: 11, fontWeight: 900, letterSpacing: 0,
              color: "#b83020", background: "none", border: "1px solid #b83020",
              padding: "1px 10px", cursor: "pointer", textTransform: "uppercase",
            }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* RL6 — situation switch. Every club spends about a fifth of the game
          on special teams, and the gap between a first and second power-play
          unit is most of the difference between a 60-point winger and an
          80-point one, so the sheet has to be able to say which. */}
      <div role="tablist" aria-label="Lineup situation" style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {([
          ["EV", "5-on-5"],
          ["PP", "Power Play"],
          ["PK", "Penalty Kill"],
        ] as [SpecialTeamsSituation, string][]).map(([key, label]) => {
          const active = situation === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => { setSituation(key); setSelected(null); setStSelected(null); }}
              className="tap-target"
              style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 900, letterSpacing: "0.08em",
                textTransform: "uppercase", padding: "3px 10px", cursor: "pointer",
                color: active ? "var(--paper)" : "var(--ledger-ice)",
                background: active ? "var(--ledger-ice)" : "transparent",
                border: `1px solid var(--ledger-ice)`,
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {situation === "PP" && renderUnitSheet("PP")}
      {situation === "PK" && renderUnitSheet("PK")}

      {/* Special-teams bench. Without this the sheet was only editable among
          the players `hydrateSpecialTeams` happened to place — anyone it left
          off could never be put on a unit at all. */}
      {situation !== "EV" && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: "var(--ledger-ink-faint)",
                        textTransform: "uppercase", letterSpacing: 0, marginBottom: 3 }}>
            Available — {stBenchPick ? "now pick a unit slot" : "tap a player, then a unit slot"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {stBenchPlayers.map(p => {
              const nav = navOf(p, navMap);
              const isSel = stBenchPick === p.id;
              return (
                <span key={p.id}
                  onClick={() => setStBenchPick(isSel ? null : p.id)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    setStBenchPick(isSel ? null : p.id);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  aria-label={`${isSel ? "Deselect" : "Select"} ${p.name} for the ${situation} unit`}
                  title={`${p.name} · ${displayPosition(p.position, p.secondaryPosition)} · NAV ${nav}`}
                  className="tap-target"
                  style={{
                    fontFamily: MONO, fontSize: 11, fontWeight: 800, cursor: "pointer",
                    minHeight: 44, display: "inline-flex", alignItems: "center",
                    padding: "4px 7px", border: "1px solid #c8b890", userSelect: "none",
                    color: inIds.has(p.id) ? "#2a7a44" : "var(--ledger-ink)",
                    background: isSel ? "rgba(180,140,40,0.25)" : "var(--ledger-cream)",
                    outline: isSel ? "1px dashed #a08020" : "none",
                  }}>
                  {abbr(p.name)}
                  <span style={{ fontSize: 11, opacity: 0.65, marginLeft: 5 }}>
                    {displayPosition(p.position, p.secondaryPosition)}
                  </span>
                  <span style={{ fontSize: 11, color: navColor(nav), marginLeft: 5 }}>NAV {nav}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {situation === "EV" && (
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <tbody>
          {renderSectionHead("Forwards")}
          {[0, 1, 2, 3].map(i => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--ledger-cream)" }}>
              {renderRowLabel(ordinals[i])}
              {renderCell("F", i * 3,     "LW")}
              {renderCell("F", i * 3 + 1, "C ")}
              {renderCell("F", i * 3 + 2, "RW")}
            </tr>
          ))}

          {renderSectionHead("Defense")}
          {[0, 1, 2].map(i => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--ledger-cream)" }}>
              {renderRowLabel(ordinals[i])}
              {renderCell("D", i * 2,     "LD")}
              {renderCell("D", i * 2 + 1, "RD")}
              <td />
            </tr>
          ))}

          {renderSectionHead("Goaltending")}
          <tr>
            {renderRowLabel("STR")}
            {renderCell("G", 0, "G ")}
            <td colSpan={2} />
          </tr>
          <tr>
            {renderRowLabel("BAK")}
            {renderCell("G", 1, "G ")}
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
      )}

      {/* Bench — extra players; click one, then click a matching lineup slot to insert */}
      {situation === "EV" && benchIds.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: "var(--ledger-ink-faint)",
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
                  onKeyDown={(event) => keySlot(event, group, idx)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${p.name} from scratches`}
                  title={`${p.name} · ${p.position} · NAV ${nav}`}
                  style={{
                    fontFamily: MONO, fontSize: 11, fontWeight: 800, cursor: "pointer",
                    minHeight: 44, display: "inline-flex", alignItems: "center",
                    padding: "4px 7px", border: "1px solid #c8b890", userSelect: "none",
                    color: inIds.has(id) ? "#2a7a44" : "var(--ledger-ink)",
                    background: isSel ? "rgba(180,140,40,0.25)" : "var(--ledger-cream)",
                    outline: isSel ? "1px dashed #a08020" : "none",
                  }}>
                  {abbr(p.name)}
                  <span style={{ fontSize: 11, opacity: 0.65, marginLeft: 5 }}>{displayPosition(p.position, p.secondaryPosition)}</span>
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

export default function LineupEditor({
  home,
  partner,
  hasActiveTrade,
  navMap,
  savedLineupOrders,
  onGoalieStarterChange,
  onLineupChange,
}: Props) {
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
                <TeamLineup
                  key={home.teamId}
                  {...home}
                  navMap={navMap}
                  savedOrder={savedLineupOrders?.[home.teamId]}
                  onGoalieStarterChange={onGoalieStarterChange}
                  onLineupChange={onLineupChange}
                />
              </div>
            )}
            {partner && (
              <div style={{ background: "var(--ledger-cream)", border: "1px solid #c8b890", padding: "10px 12px" }}>
                <TeamLineup
                  key={partner.teamId}
                  {...partner}
                  navMap={navMap}
                  savedOrder={savedLineupOrders?.[partner.teamId]}
                  onGoalieStarterChange={onGoalieStarterChange}
                  onLineupChange={onLineupChange}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
