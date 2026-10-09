"use client";

import { useId } from "react";
import dynamic from "next/dynamic";
import { observedLabel, type ObservedSelection } from "@/app/lib/observed-season";
import { teamPercentages, type TeamBalanceInput } from "@/app/lib/team-balance";

const Plot = dynamic(() => import("@/app/components/TeamPercentagePlot"), { ssr: false,
  loading: () => <p role="status" className="text-[11px] py-8">Loading chart… values are available below.</p> });
const metrics = [{ key: "powerPlay", label: "PP", name: "Power play" }, { key: "penaltyKill", label: "PK", name: "Penalty kill" },
  { key: "faceoffs", label: "FO", name: "Faceoffs" }] as const;
const formatted = (value: number | null) => value === null ? "Unavailable" : `${value.toFixed(1)}%`;

export default function TeamPercentageCharts({ teams, selection }: { teams: TeamBalanceInput[]; selection: ObservedSelection }) {
  const id = useId();
  const values = teams.slice(0, 2).map(team => teamPercentages(team, selection));
  const rows = metrics.map(metric => ({ label: metric.label, first: values[0]?.[metric.key] ?? null, second: values[1]?.[metric.key] ?? null }));
  const hasValues = rows.some(row => row.first !== null || row.second !== null);
  return <section aria-labelledby={`${id}-title`} className="py-3">
    <h3 id={`${id}-title`} className="text-[13px] font-black">Special teams &amp; faceoffs</h3>
    <p className="text-[11px] mt-1 mb-2">{observedLabel(selection)} · NHL-reported season percentages. PP: power play · PK: penalty kill · FO: faceoffs won.</p>
    <div className="border p-3 min-w-0" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
      <ul className="flex flex-wrap gap-3 text-[11px] mb-2">{values.map((team, index) => <li key={team.id}>
        <strong style={{ color: index === 0 ? "#1a4b5b" : "#9c2b1f" }}>■ {team.id}</strong> · {team.games ?? "Unavailable"} GP
      </li>)}</ul>
      {hasValues ? <Plot rows={rows} firstName={values[0].id} secondName={values[1]?.id} />
        : <p className="text-[11px] py-4">No selected-season percentages available.</p>}
      <table className="w-full text-[11px] tabular-nums">
        <caption className="sr-only">Special teams and faceoff percentages · {observedLabel(selection)}</caption>
        <thead><tr><th scope="col" className="text-left py-2">Statistic</th>{values.map(team => <th key={team.id} scope="col" className="text-right pl-2">{team.id}</th>)}</tr></thead>
        <tbody>{metrics.map(metric => <tr key={metric.key} className="border-t" style={{ borderColor: "var(--ledger-rule)" }}>
          <th scope="row" className="text-left py-2 font-normal">{metric.name}</th>{values.map(team => <td key={team.id} className="text-right pl-2">{formatted(team[metric.key])}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="text-[10px] mt-2">Fixed 0–100% scale; higher is better for each statistic. Values display to one decimal. Missing values are not plotted. Games played are shown; special-teams opportunity counts are not available in this view.</p>
  </section>;
}
