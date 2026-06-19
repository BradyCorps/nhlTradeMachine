"use client";
// ── LineupCard — NHL depth chart showing 4 forward lines, 3 D pairs, 2 goalies
// Trade changes are reflected live: outgoing players grayed/struck, incoming slotted in green.

import React from "react";

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

interface Props {
  roster:   Player[];
  outgoing: Player[];
  incoming: Player[];
  label?:   string;
}

type SlotStatus = "normal" | "out" | "in" | "empty";

interface Slot {
  player: Player | null;
  status: SlotStatus;
}

const MONO = "'Courier Prime', monospace";
const abbr = (name: string) => {
  const parts = name.split(" ");
  if (parts.length < 2) return name.slice(0, 10);
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`.slice(0, 14);
};

const sortByIce     = (ps: Player[]) =>
  [...ps].sort((a, b) => (b.avgTOI ?? b.ptsPace ?? 0) - (a.avgTOI ?? a.ptsPace ?? 0));

const sortByGames   = (ps: Player[]) =>
  [...ps].sort((a, b) => (b.games ?? 0) - (a.games ?? 0));

function buildLineup(roster: Player[], outgoing: Player[], incoming: Player[]) {
  const outIds = new Set(outgoing.map(p => p.id));
  const inIds  = new Set(incoming.map(p => p.id));

  // Effective roster: remove outgoing, add incoming
  const effective = [
    ...roster.filter(p => !outIds.has(p.id)),
    ...incoming,
  ];

  const isC = (p: Player) => p.position === "C";
  const isW = (p: Player) =>
    ["W", "L", "R", "LW", "RW"].includes(p.position) ||
    p.secondaryPosition === "W";
  const isD = (p: Player) => p.position === "D";
  const isG = (p: Player) => p.position === "G";

  // Centers: top 4 by TOI
  const centers   = sortByIce(effective.filter(isC)).slice(0, 4);
  const centerIds = new Set(centers.map(p => p.id));

  // Wingers: primary wingers first; if short, flex in centers not already in top-4 slots
  const primaryW = sortByIce(effective.filter(isW));
  const flexC    = primaryW.length < 8
    ? sortByIce(effective.filter(p => isC(p) && !centerIds.has(p.id)))
    : [];
  const wingers = [...primaryW, ...flexC].slice(0, 8);

  const dmen   = sortByIce(effective.filter(isD)).slice(0, 6);
  const goalies = sortByGames(effective.filter(isG)).slice(0, 2);

  const statusOf = (p: Player): SlotStatus =>
    inIds.has(p.id) ? "in" : outIds.has(p.id) ? "out" : "normal";

  const slot = (p: Player | null): Slot =>
    p ? { player: p, status: statusOf(p) } : { player: null, status: "empty" };

  // Check if an outgoing player occupied a position
  // For original roster players that are going out — show them as "out" in position
  const origCenters   = sortByIce(roster.filter(isC)).slice(0, 4);
  const origCenterIds = new Set(origCenters.map(p => p.id));
  const origPrimW     = sortByIce(roster.filter(isW));
  const origFlexC     = origPrimW.length < 8
    ? sortByIce(roster.filter(p => isC(p) && !origCenterIds.has(p.id)))
    : [];
  const origWingers = [...origPrimW, ...origFlexC].slice(0, 8);
  const origDmen    = sortByIce(roster.filter(isD)).slice(0, 6);
  const origGoalies = sortByGames(roster.filter(isG)).slice(0, 2);

  // Build lines showing both outgoing and incoming in order
  const buildSlots = (orig: Player[], eff: Player[], count: number): Slot[] => {
    const slots: Slot[] = [];
    // Show outgoing players in their original position
    const shownOutIds = new Set<string>();
    for (let i = 0; i < count; i++) {
      const origP = orig[i];
      if (origP && outIds.has(origP.id) && !shownOutIds.has(origP.id)) {
        slots.push({ player: origP, status: "out" });
        shownOutIds.add(origP.id);
      } else {
        const effP = eff.find(p => !slots.some(s => s.player?.id === p.id));
        slots.push(slot(effP ?? null));
      }
    }
    return slots.slice(0, count);
  };

  const cSlots  = buildSlots(origCenters, centers, 4);
  const wSlots  = buildSlots(origWingers, wingers, 8);
  const dSlots  = buildSlots(origDmen, dmen, 6);
  const gSlots  = buildSlots(origGoalies, goalies, 2);

  // Group into lines
  const lines: { line: number; lw: Slot; c: Slot; rw: Slot }[] = [];
  for (let i = 0; i < 4; i++) {
    lines.push({
      line: i + 1,
      lw:  wSlots[i * 2]     ?? { player: null, status: "empty" },
      c:   cSlots[i]         ?? { player: null, status: "empty" },
      rw:  wSlots[i * 2 + 1] ?? { player: null, status: "empty" },
    });
  }

  const pairs: { pair: number; ld: Slot; rd: Slot }[] = [];
  for (let i = 0; i < 3; i++) {
    pairs.push({
      pair: i + 1,
      ld: dSlots[i * 2]     ?? { player: null, status: "empty" },
      rd: dSlots[i * 2 + 1] ?? { player: null, status: "empty" },
    });
  }

  return { lines, pairs, starter: gSlots[0] ?? slot(null), backup: gSlots[1] ?? slot(null) };
}

const STATUS_COLOR: Record<SlotStatus, string> = {
  normal: "var(--ledger-ink)",
  out:    "#b83020",
  in:     "#2a7a44",
  empty:  "var(--ledger-ink-faint)",
};

function PlayerCell({ slot, pos }: { slot: Slot; pos: string }) {
  const color = STATUS_COLOR[slot.status];
  const name  = slot.player ? abbr(slot.player.name) : "—";
  return (
    <td style={{
      padding: "2px 5px", fontFamily: MONO, fontSize: 11, color,
      fontWeight: slot.status === "in" ? 900 : slot.status === "normal" ? 700 : 400,
      textDecoration: slot.status === "out" ? "line-through" : "none",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 11, opacity: 0.55, marginRight: 3, fontWeight: 900 }}>{pos}</span>
      {name}
      {slot.status === "in"  && <span style={{ fontSize: 11, marginLeft: 3, color: "#2a7a44" }}>▲</span>}
      {slot.status === "out" && <span style={{ fontSize: 11, marginLeft: 3, color: "#b83020" }}>▼</span>}
    </td>
  );
}

export default function LineupCard({ roster, outgoing, incoming, label }: Props) {
  const { lines, pairs, starter, backup } = buildLineup(roster, outgoing, incoming);

  const SectionHead = ({ children }: { children: React.ReactNode }) => (
    <tr>
      <td colSpan={4} style={{
        fontFamily: MONO, fontSize: 11, fontWeight: 900, color: "var(--ledger-ink-faint)",
        textTransform: "uppercase", letterSpacing: "0.15em", paddingTop: 6, paddingBottom: 2,
        borderBottom: "1px solid #c8b890",
      }}>
        {children}
      </td>
    </tr>
  );

  const LineLabel = ({ n, ordinal }: { n: number; ordinal: string }) => (
    <td style={{
      fontFamily: MONO, fontSize: 11, fontWeight: 900, color: "var(--ledger-ink-faint)",
      paddingRight: 4, whiteSpace: "nowrap", width: 36,
    }}>
      {ordinal}
    </td>
  );

  const ordinals = ["1st", "2nd", "3rd", "4th"];

  return (
    <div style={{ fontFamily: MONO }}>
      {label && (
        <div style={{ fontSize: 11, fontWeight: 900, color: "var(--ledger-ink-faint)",
                      textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6 }}>
          {label}
        </div>
      )}
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <tbody>
          <SectionHead>Forwards</SectionHead>
          {lines.map((l, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--ledger-cream)" }}>
              <LineLabel n={l.line} ordinal={ordinals[i]} />
              <PlayerCell slot={l.lw} pos="LW" />
              <PlayerCell slot={l.c}  pos="C " />
              <PlayerCell slot={l.rw} pos="RW" />
            </tr>
          ))}

          <SectionHead>Defense</SectionHead>
          {pairs.map((p, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "var(--ledger-cream)" }}>
              <LineLabel n={p.pair} ordinal={ordinals[i]} />
              <PlayerCell slot={p.ld} pos="LD" />
              <PlayerCell slot={p.rd} pos="RD" />
              <td />
            </tr>
          ))}

          <SectionHead>Goaltending</SectionHead>
          <tr>
            <LineLabel n={1} ordinal="STR" />
            <PlayerCell slot={starter} pos="G " />
            <td colSpan={2} />
          </tr>
          <tr>
            <LineLabel n={2} ordinal="BAK" />
            <PlayerCell slot={backup} pos="G " />
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>

      {/* Legend */}
      <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 11, fontFamily: MONO }}>
        <span style={{ color: "#2a7a44", fontWeight: 900 }}>▲ incoming</span>
        <span style={{ color: "#b83020", fontWeight: 900 }}>▼ outgoing</span>
      </div>
    </div>
  );
}
