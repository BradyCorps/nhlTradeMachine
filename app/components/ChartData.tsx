"use client";

import { useState } from "react";

export interface ChartRow { id: string; label: string; values: string[] }

/** Values short enough to sit side by side as numbers ("46", "+2.1", "$4.0M"). */
const MATRIX_VALUE_MAX = 8;
const KEYS = ["①", "②", "③", "④", "⑤", "⑥"];

/** The same plotted inputs, readable and pinnable without pointer hover. */
export function ChartData({ title, columns, rows }: { title: string; columns: string[]; rows: ChartRow[] }) {
  const [pinned, setPinned] = useState<string[]>([]);
  const toggle = (id: string) => setPinned(current => current.includes(id) ? current.filter(value => value !== id) : [...current.slice(-1), id]);
  const selected = rows.filter(row => pinned.includes(row.id));
  // Numeric readings read as a matrix — column labels once, one short row per
  // reading. Printed as "Label: value" lines per row, a franchise DNA table was
  // eight ~200px rows on a phone. Prose values keep the per-row layout.
  const matrix = rows.every(row => row.values.every(value => String(value ?? "").length <= MATRIX_VALUE_MAX));
  const pinButton = (row: ChartRow) => <button type="button" className="tap-target filter-btn" aria-label={`Pin ${row.label}`} aria-pressed={pinned.includes(row.id)} onClick={() => toggle(row.id)}>{pinned.includes(row.id) ? "Unpin" : "Pin"}</button>;
  return <details className="chart-data">
    <summary className="tap-target">{title}: values, pin and compare</summary>
    <p>Select up to two readings to keep them visible for comparison.</p>
    <div role="status">
      {selected.map(row => <div key={row.id} className="chart-data-pinned"><strong>Pinned: {row.label}</strong><Values columns={columns} values={row.values} /></div>)}
    </div>
    {matrix ? (
      <div className="chart-data-scroll" role="region" aria-label={`${title} values`} tabIndex={0}>
        {/* Narrow panels key the columns ①–④ with this legend; the full
            header text stays in the table for assistive technology. */}
        <p className="chart-data-legend" aria-hidden="true">
          {columns.map((column, index) => <span key={column}>{KEYS[index] ?? index + 1} {column}</span>)}
        </p>
        <table className="chart-data-matrix">
          <caption>{title}</caption>
          <thead><tr>
            <th scope="col">Reading</th>
            {columns.map((column, index) => <th key={column} scope="col">
              <span className="chart-data-full">{column}</span>
              <span className="chart-data-key" aria-hidden="true">{KEYS[index] ?? index + 1}</span>
            </th>)}
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <th scope="row"><div className="chart-data-rowhead"><span>{row.label}</span>{pinButton(row)}</div></th>
            {columns.map((column, index) => <td key={column}>{row.values[index]}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    ) : (
      <table>
        <caption>{title}</caption>
        <thead><tr><th scope="col">Reading</th><th scope="col">Values</th><th scope="col">Pin</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <th scope="row">{row.label}</th>
          <td><Values columns={columns} values={row.values} /></td>
          <td>{pinButton(row)}</td>
        </tr>)}</tbody>
      </table>
    )}
  </details>;
}

/** Label-over-value pairs in a grid that fits two to four per row, rather
 *  than one "Label: value" sentence per line (a very tall panel on phones). */
function Values({ columns, values }: { columns: string[]; values: string[] }) {
  return <dl className="chart-data-values">
    {columns.map((column, index) => <div key={column}><dt>{column}</dt><dd>{values[index]}</dd></div>)}
  </dl>;
}
