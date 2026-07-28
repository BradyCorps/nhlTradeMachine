"use client";
// ── CapHorizon — the roster, by contract year ────────────────────
// A commitment table in the shape people already know from cap sites: one row
// per player, one column per season, the AAV shown in each year the deal
// covers, and the year it ends marked with the rights you'd be negotiating
// against. Underneath, committed / ceiling / space per season.
//
// The point is decision consequence. Signing a six-year deal today is judged
// against this season's space, but the bill lands in the seasons where your own
// extensions fall due — and those are visible here as the expiry markers.

import React, { useMemo, useState } from "react";
import type { HorizonSeason } from "@/app/lib/cap-horizon";

const MONO = "'Courier Prime', monospace";
const money = (m: number) => `$${m.toFixed(1)}M`;

interface Props {
  horizon: HorizonSeason[];
  /** Highlighted as a what-if overlay rather than a committed deal. */
  projectionLabel?: string | null;
  /** Collapsed by default — this is reference, not the primary action. */
  defaultOpen?: boolean;
}

export function CapHorizon({ horizon, projectionLabel = null, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  // One row per player, with a cell per season. A player under contract for two
  // of three seasons has two filled cells and one blank.
  const rows = useMemo(() => {
    const byId = new Map<string, { name: string; position?: string; cells: (number | null)[]; endsAt: number | null; expiryStatus: string | null }>();
    horizon.forEach((season, i) => {
      for (const c of season.contracts) {
        const row = byId.get(c.id) ?? {
          name: c.name, position: c.position,
          cells: new Array(horizon.length).fill(null),
          endsAt: null, expiryStatus: c.expiryStatus,
        };
        row.cells[i] = c.capHit;
        if (c.expiresAfter) row.endsAt = i;
        byId.set(c.id, row);
      }
    });
    return [...byId.values()].sort((a, b) =>
      (b.cells[0] ?? 0) - (a.cells[0] ?? 0) || a.name.localeCompare(b.name));
  }, [horizon]);

  if (horizon.length === 0) return null;
  const anyOver = horizon.some(s => s.space < 0);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="tap-target w-full flex items-center justify-between gap-3 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] font-mono"
        style={{
          background: "var(--paper-inset)",
          border: `1px solid ${anyOver ? "var(--ledger-red)" : "var(--ledger-rule)"}`,
          borderRadius: "2px",
          color: "var(--ledger-ink)",
        }}>
        <span>Cap Horizon — Roster by Contract Year</span>
        <span className="text-[11px] font-mono" style={{ color: anyOver ? "var(--ledger-red)" : "var(--ledger-ink-faint)" }}>
          {anyOver ? "OVER IN A FUTURE SEASON" : `${horizon.length} seasons`} {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-2 overflow-x-auto" style={{ border: "1px solid var(--ledger-rule-light)", borderRadius: "2px" }}>
          {projectionLabel && (
            <p className="text-[10px] font-mono px-3 py-2" role="status"
              style={{ background: "var(--paper-inset)", color: "var(--ledger-ink)", borderBottom: "1px solid var(--ledger-rule-light)" }}>
              Projected with {projectionLabel} included.
            </p>
          )}
          <table className="w-full" style={{ borderCollapse: "collapse", fontFamily: MONO, minWidth: 420 }}>
            <caption className="text-[10px] font-mono px-3 py-2 text-left" style={{ color: "var(--ledger-brown)" }}>
              Cap hit per season. A player&apos;s last contracted year is marked with the
              rights you would be negotiating against that summer.
            </caption>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--ledger-rule)" }}>
                <th scope="col" className="text-left text-[10px] font-black uppercase tracking-[0.14em] px-3 py-2"
                  style={{ color: "var(--ledger-ink-faint)" }}>Player</th>
                {horizon.map(s => (
                  <th key={s.label} scope="col"
                    className="text-right text-[10px] font-black uppercase tracking-[0.14em] px-3 py-2 tabular-nums"
                    style={{ color: "var(--ledger-ink-faint)", whiteSpace: "nowrap" }}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.name} style={{ borderBottom: "1px solid var(--ledger-rule-light)" }}>
                  <th scope="row" className="text-left text-[11px] font-bold px-3 py-1.5"
                    style={{ color: "var(--ledger-ink)", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {row.name}
                    {row.position && (
                      <span className="text-[10px] ml-1.5" style={{ color: "var(--ledger-ink-faint)" }}>{row.position}</span>
                    )}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="text-right text-[11px] px-3 py-1.5 tabular-nums"
                      style={{ color: cell == null ? "var(--ledger-ink-faint)" : "var(--ledger-ink)", whiteSpace: "nowrap" }}>
                      {cell == null ? "—" : money(cell)}
                      {row.endsAt === i && (
                        <span className="text-[10px] font-black ml-1" style={{ color: "var(--ledger-brown)" }}>
                          {row.expiryStatus === "RFA" ? "RFA" : "UFA"}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--ledger-rule)" }}>
                <th scope="row" className="text-left text-[10px] font-black uppercase tracking-[0.14em] px-3 py-2"
                  style={{ color: "var(--ledger-ink-faint)" }}>Committed</th>
                {horizon.map(s => (
                  <td key={s.label} className="text-right text-[11px] font-black px-3 py-2 tabular-nums"
                    style={{ color: "var(--ledger-ink)" }}>{money(s.committed)}</td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="text-left text-[10px] font-black uppercase tracking-[0.14em] px-3 py-1"
                  style={{ color: "var(--ledger-ink-faint)" }}>Ceiling</th>
                {horizon.map(s => (
                  <td key={s.label} className="text-right text-[10px] px-3 py-1 tabular-nums"
                    style={{ color: "var(--ledger-brown)" }}>{money(s.ceiling)}</td>
                ))}
              </tr>
              <tr style={{ borderTop: "1px solid var(--ledger-rule-light)" }}>
                <th scope="row" className="text-left text-[10px] font-black uppercase tracking-[0.14em] px-3 py-2"
                  style={{ color: "var(--ledger-ink-faint)" }}>Space</th>
                {horizon.map(s => (
                  <td key={s.label} className="text-right text-[11px] font-black px-3 py-2 tabular-nums"
                    style={{ color: s.space < 0 ? "var(--ledger-red)" : "var(--ledger-green)" }}>
                    {money(s.space)}{s.space < 0 ? " over" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>

          {/* The decisions each season creates — the half of the story a cap
              number alone never tells. */}
          {horizon.some(s => s.expiring.length > 0) && (
            <div className="px-3 py-2" style={{ borderTop: "1px solid var(--ledger-rule-light)", background: "var(--paper-inset)" }}>
              <h4 className="text-[10px] font-black uppercase tracking-[0.18em] font-mono mb-1"
                style={{ color: "var(--ledger-ink-faint)" }}>Decisions Ahead</h4>
              <ul role="list" className="flex flex-col gap-0.5" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {horizon.filter(s => s.expiring.length > 0).map(s => (
                  <li key={s.label} className="text-[10px] font-mono" style={{ color: "var(--ledger-brown)" }}>
                    <strong style={{ color: "var(--ledger-ink)" }}>After {s.label}:</strong>{" "}
                    {s.expiring.map(c => `${c.name} (${money(c.capHit)})`).join(" · ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
