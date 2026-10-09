"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";

export interface BalancePlotRow { label: string; forValue: number | null; againstValue: number | null }

export default function TeamBalancePlot({ rows }: { rows: BalancePlotRow[] }) {
  const label = (value: unknown) => typeof value === "number" ? value.toFixed(2) : "";
  return <div aria-hidden="true" style={{ height: rows.length > 1 ? 210 : 150, width: "100%", minWidth: 0 }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 8, bottom: 0, left: 0, right: 48 }} barGap={5} accessibilityLayer={false}>
        <CartesianGrid horizontal={false} stroke="var(--ledger-rule)" strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, "auto"]} tick={{ fontSize: 10, fill: "var(--ledger-ink-faint)" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={42} tick={{ fontSize: 11, fill: "var(--ledger-ink)" }} axisLine={false} tickLine={false} />
        <Bar dataKey="forValue" name="For" fill="#1a4b5b" maxBarSize={24} isAnimationActive={false}>
          <LabelList dataKey="forValue" position="right" formatter={label} fill="var(--ledger-ink)" fontSize={10} />
        </Bar>
        <Bar dataKey="againstValue" name="Against" fill="#9c2b1f" maxBarSize={24} isAnimationActive={false}>
          <LabelList dataKey="againstValue" position="right" formatter={label} fill="var(--ledger-ink)" fontSize={10} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
