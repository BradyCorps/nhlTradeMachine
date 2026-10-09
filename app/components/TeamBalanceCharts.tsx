"use client";

import { useId } from "react";
import dynamic from "next/dynamic";
import { observedLabel, type ObservedSelection } from "@/app/lib/observed-season";
import { balanceDifference, balanceValue, type TeamBalance } from "@/app/lib/team-balance";

const Plot = dynamic(() => import("@/app/components/TeamBalancePlot"), { ssr: false,
  loading: () => <p role="status" className="text-[11px] flex items-center justify-center h-[150px]">Loading chart… values are available below.</p> });

export default function TeamBalanceCharts({ teams, selection }: { teams: TeamBalance[]; selection: ObservedSelection }) {
  const id = useId();
  return <section aria-labelledby={`${id}-title`} className="py-3">
    <h3 id={`${id}-title`} className="text-[13px] font-black">Scoring &amp; shot balance</h3>
    <p className="text-[11px] mt-1 mb-3">{observedLabel(selection)} · NHL team summary, all situations. Season-to-date averages; not a forecast for tonight.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {(["goals", "shots"] as const).map(metric => {
        const title = metric === "goals" ? "Goals per game" : "Shots per game";
        const rows = teams.map(team => ({ team, forValue: metric === "goals" ? team.goalsFor : team.shotsFor,
          againstValue: metric === "goals" ? team.goalsAgainst : team.shotsAgainst }));
        const hasValues = rows.some(row => row.forValue !== null || row.againstValue !== null);
        return <div key={metric} className="min-w-0 border p-3" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
          <h4 className="text-[12px] font-black">{title}</h4>
          <p className="text-[10px] mt-1"><span style={{ color: "#1a4b5b" }}>■ For</span> · <span style={{ color: "#9c2b1f" }}>■ Against</span> · zero-based scale</p>
          {hasValues ? <Plot rows={rows.map(row => ({ label: row.team.id, forValue: row.forValue, againstValue: row.againstValue }))} />
            : <p className="text-[11px] py-5">No selected-season {metric} rates available.</p>}
          <ul className="text-[11px] space-y-1 mb-2">
            {rows.map(({ team, forValue, againstValue }) => <li key={team.id}>
              <strong>{team.id}</strong>: {balanceValue(forValue)} for · {balanceValue(againstValue)} against · {balanceValue(balanceDifference(forValue, againstValue), true)} net / game
              <span className="block text-[10px]">{team.reason ?? `${team.games} games played`}</span>
            </li>)}
          </ul>
          <details>
            <summary className="min-h-11 flex items-center cursor-pointer text-[11px] underline">{metric === "goals" ? "Goals" : "Shots"} values</summary>
            <table className="w-full text-[10px] tabular-nums">
              <caption className="text-left mb-2">{title} · {observedLabel(selection)}</caption>
              <thead><tr><th scope="col" className="text-left">Team</th>{["GP", "For", "Against", "Net"].map(label => <th key={label} scope="col" className="text-right pl-1">{label}</th>)}</tr></thead>
              <tbody>{rows.map(({ team, forValue, againstValue }) => <tr key={team.id}>
                <th scope="row" className="text-left py-2" title={team.name}>{team.id}</th><td className="text-right">{team.games ?? "—"}</td>
                {[forValue, againstValue, balanceDifference(forValue, againstValue)].map((value, index) => <td key={index} className="text-right pl-1">{value === null ? "—" : balanceValue(value, index === 2)}</td>)}
              </tr>)}</tbody>
            </table>
          </details>
        </div>;
      })}
    </div>
    <p className="text-[10px] mt-2">Goals rates use team totals ÷ games played; shot rates use the NHL’s published per-game values. Values display to two decimals. Each panel has its own scale. Missing values are not plotted.</p>
  </section>;
}
