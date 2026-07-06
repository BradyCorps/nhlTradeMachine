"use client";

// ── Back Issues — NYT-style archive calendar ──────────────────
// One cell per hand since the epoch. Filled = finished, starred =
// perfect hand, outlined = missed, red ring = today. Click any past
// day to play or review it.

import React, { useEffect, useState } from "react";
import {
  dateFromDayNumber,
  dealDailyHand,
  findOptimalScore,
  type PressBoxPlayer,
} from "@/app/lib/press-box-engine";

type DayStatus = "perfect" | "completed" | "in-progress" | "unplayed";

interface DayEntry {
  dayNum: number;
  date: Date;
  status: DayStatus;
}

function readDayStatus(dayNum: number, pool: PressBoxPlayer[]): DayStatus {
  try {
    const raw = localStorage.getItem(`press-box-state-${dayNum}`);
    if (!raw) return "unplayed";
    const saved = JSON.parse(raw);
    const attempts: { score: number }[] = saved.version === 2
      ? saved.attempts ?? []
      : saved.phase === "SCORED" && saved.picks?.length
        ? [{ score: saved.score ?? 0 }]
        : [];
    if (attempts.length === 0) return "unplayed";
    const over = saved.version === 2 ? !!saved.gameOver : true;
    if (!over) return "in-progress";
    const hand = dealDailyHand(pool, dayNum);
    const optimal = findOptimalScore(hand.dealt, hand.callUp);
    return attempts.some((a) => a.score === optimal) ? "perfect" : "completed";
  } catch {
    return "unplayed";
  }
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function PressBoxCalendar({
  pool,
  todayNum,
  refreshKey,
}: {
  pool: PressBoxPlayer[];
  todayNum: number;
  refreshKey: string; // bump when the current hand's saved state changes
}) {
  // localStorage only exists client-side — populate after mount so the
  // server-rendered markup matches the first client render.
  const [entries, setEntries] = useState<DayEntry[] | null>(null);

  useEffect(() => {
    const list: DayEntry[] = [];
    for (let n = 1; n <= todayNum; n++) {
      list.push({ dayNum: n, date: dateFromDayNumber(n), status: readDayStatus(n, pool) });
    }
    setEntries(list);
  }, [pool, todayNum, refreshKey]);

  if (!entries || entries.length === 0) return null;

  const played = entries.filter((e) => e.status === "completed" || e.status === "perfect").length;
  const perfect = entries.filter((e) => e.status === "perfect").length;

  // Group entries by calendar month
  const months: { label: string; cells: (DayEntry | null)[] }[] = [];
  for (const entry of entries) {
    const label = MONTH_LABEL.format(entry.date);
    let month = months[months.length - 1];
    if (!month || month.label !== label) {
      month = { label, cells: [] };
      // pad to the weekday of this entry (first visible day of the month)
      for (let i = 0; i < entry.date.getUTCDay(); i++) month.cells.push(null);
      months.push(month);
    }
    month.cells.push(entry);
  }

  const cellStyle = (e: DayEntry): React.CSSProperties => {
    const isToday = e.dayNum === todayNum;
    const base: React.CSSProperties = {
      borderRadius: 2,
      border: "1px solid var(--rule)",
      color: "var(--ledger-ink-faint)",
      background: "transparent",
    };
    if (e.status === "perfect") {
      Object.assign(base, { background: "var(--ledger-green)", borderColor: "var(--ledger-green)", color: "#fff" });
    } else if (e.status === "completed") {
      Object.assign(base, { background: "var(--ink)", borderColor: "var(--ink)", color: "var(--paper)" });
    } else if (e.status === "in-progress") {
      Object.assign(base, { background: "var(--ledger-amber)", borderColor: "var(--ledger-amber)", color: "#fff" });
    }
    if (isToday) {
      Object.assign(base, { boxShadow: "0 0 0 2px var(--ledger-red)" });
    }
    return base;
  };

  return (
    <div className="mt-6">
      <div
        className="flex items-baseline justify-between pb-1 border-b mb-3"
        style={{ borderColor: "var(--rule)" }}
      >
        <span
          className="text-[10px] font-black uppercase tracking-[0.3em] font-mono"
          style={{ color: "var(--ledger-ink-faint)" }}
        >
          Back Issues
        </span>
        <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "var(--ledger-ink-faint)" }}>
          {played}/{entries.length} played · {perfect} perfect
        </span>
      </div>

      <div className="space-y-4">
        {months.map((month) => (
          <div key={month.label}>
            <div
              className="text-[11px] font-black font-serif mb-1.5"
              style={{ color: "var(--ink)" }}
            >
              {month.label}
            </div>
            <div className="grid grid-cols-7 gap-1 max-w-[320px]">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={`wd-${i}`}
                  className="text-center text-[10px] font-mono font-black"
                  style={{ color: "var(--ledger-ink-faint)" }}
                >
                  {d}
                </div>
              ))}
              {month.cells.map((e, i) =>
                e === null ? (
                  <div key={`pad-${i}`} />
                ) : (
                  <a
                    key={e.dayNum}
                    href={e.dayNum === todayNum ? "/press-box" : `/press-box?day=${e.dayNum}`}
                    className="relative flex items-center justify-center aspect-square text-[10px] font-mono font-black no-underline transition-transform hover:scale-110"
                    style={cellStyle(e)}
                    title={`Hand #${e.dayNum}`}
                  >
                    {e.date.getUTCDate()}
                    {e.status === "perfect" && (
                      <span className="absolute -top-1 -right-1 text-[9px]" style={{ color: "var(--ledger-amber)" }}>
                        ★
                      </span>
                    )}
                  </a>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[10px] font-mono uppercase tracking-wider"
        style={{ color: "var(--ledger-ink-faint)" }}
      >
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--ledger-green)", borderRadius: 2 }} /> Perfect
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--ink)", borderRadius: 2 }} /> Finished
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5" style={{ background: "var(--ledger-amber)", borderRadius: 2 }} /> In Progress
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 border" style={{ borderColor: "var(--rule)", borderRadius: 2 }} /> Open
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5" style={{ boxShadow: "0 0 0 2px var(--ledger-red)", borderRadius: 2 }} /> Today
        </span>
      </div>
    </div>
  );
}
