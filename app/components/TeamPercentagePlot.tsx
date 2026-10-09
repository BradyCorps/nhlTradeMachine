"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";

export interface PercentagePlotRow { label: string; first: number | null; second: number | null }

export default function TeamPercentagePlot({ rows, firstName, secondName }: {
  rows: PercentagePlotRow[]; firstName: string; secondName?: string;
}) {
  const label = (value: unknown) => typeof value === "number" ? `${value.toFixed(1)}%` : "";
  return <div aria-hidden="true" style={{ width: "100%", height: secondName ? 270 : 220, minWidth: 0 }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 8, bottom: 0, left: 0, right: 48 }} barGap={4} accessibilityLayer={false}>
        <CartesianGrid horizontal={false} stroke="var(--ledger-rule)" strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={value => `${value}%`}
          tick={{ fontSize: 10, fill: "var(--ledger-ink-faint)" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={38} tick={{ fontSize: 11, fill: "var(--ledger-ink)" }} axisLine={false} tickLine={false} />
        <Bar dataKey="first" name={firstName} fill="#1a4b5b" maxBarSize={22} isAnimationActive={false}>
          <LabelList dataKey="first" position="right" formatter={label} fill="var(--ledger-ink)" fontSize={10} />
        </Bar>
        {secondName && <Bar dataKey="second" name={secondName} fill="#9c2b1f" maxBarSize={22} isAnimationActive={false}>
          <LabelList dataKey="second" position="right" formatter={label} fill="var(--ledger-ink)" fontSize={10} />
        </Bar>}
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
