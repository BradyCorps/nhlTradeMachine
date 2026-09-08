"use client";

import { useState } from "react";

export interface ChartRow { id: string; label: string; values: string[] }

/** The same plotted inputs, readable and pinnable without pointer hover. */
export function ChartData({ title, columns, rows }: { title: string; columns: string[]; rows: ChartRow[] }) {
  const [pinned, setPinned] = useState<string[]>([]);
  const toggle = (id: string) => setPinned(current => current.includes(id) ? current.filter(value => value !== id) : [...current.slice(-1), id]);
  const selected = rows.filter(row => pinned.includes(row.id));
  return <details className="chart-data">
    <summary className="tap-target">{title}: values, pin and compare</summary>
    <p>Select up to two readings to keep them visible for comparison.</p>
    <div role="status">
      {selected.map(row => <p key={row.id}><strong>Pinned: {row.label}</strong> — {columns.map((column, index) => `${column}: ${row.values[index]}`).join(" · ")}</p>)}
    </div>
    <table>
      <caption>{title}</caption>
      <thead><tr><th scope="col">Reading</th><th scope="col">Values</th><th scope="col">Pin</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <th scope="row">{row.label}</th>
        <td>{columns.map((column, index) => <div key={column}>{column}: {row.values[index]}</div>)}</td>
        <td><button type="button" className="tap-target filter-btn" aria-label={`Pin ${row.label}`} aria-pressed={pinned.includes(row.id)} onClick={() => toggle(row.id)}>{pinned.includes(row.id) ? "Unpin" : "Pin"}</button></td>
      </tr>)}</tbody>
    </table>
  </details>;
}
