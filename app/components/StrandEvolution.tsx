"use client";
// ── StrandEvolution — how the measured profile changes, compactly ──
// Everything shown is precomputed on the server (strand-evolution.ts); this
// component only chooses which comparison to display. No animation: there are no
// measurements between checkpoints, so nothing is interpolated or tweened, and
// there is nothing for a reduced-motion preference to switch off.

import { useState } from "react";
import StrandDisplay from "@/app/components/StrandDisplay";
import type { StrandTrait } from "@/app/lib/strand-traits";
import {
  TRAIT_KEYS, TRAITS, formatTrait,
  type ComparisonCell, type ComparisonRow, type EvolutionOption, type EvolutionView, type TraitKey,
} from "@/app/lib/strand-evolution";

const faint = "var(--ledger-ink-faint)";
const rule = "var(--ledger-rule)";
const body = "var(--ledger-ink-body, var(--ledger-ink))";

const RAILS: Record<"production" | "usage", TraitKey[]> = {
  production: TRAIT_KEYS.filter(k => TRAITS[k].rail === "production"),
  usage: TRAIT_KEYS.filter(k => TRAITS[k].rail === "usage"),
};

function toTrait(row: ComparisonRow, cell: ComparisonCell): StrandTrait {
  // A node needs a percentile to have a height. Without one it is greyed, and the
  // raw rate is in the table — a rate is never drawn as if it were a ranking.
  if (cell.pct == null) return { label: TRAITS[row.key].label, val: 0.5, unavailable: true, title: cell.missing ?? "No cohort percentile" };
  return {
    label: TRAITS[row.key].label, val: cell.pct / 100, display: cell.pct,
    raw: `${formatTrait(row.key, cell.value)} ${TRAITS[row.key].unit}`,
  };
}

const railOf = (rows: ComparisonRow[], rail: "production" | "usage") =>
  RAILS[rail].map(k => rows.find(r => r.key === k)!);

const dateOf = (ms: number | null) => (ms == null ? "unknown date" : new Date(ms).toISOString().slice(0, 10));
const signed = (v: number, digits: number) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

function Cell({ row, cell }: { row: ComparisonRow; cell: ComparisonCell }) {
  if (cell.value == null) return <span title={cell.missing ?? ""}>— <span style={{ color: faint }}>({cell.missing})</span></span>;
  return (
    <span>
      {formatTrait(row.key, cell.value)}
      <span style={{ color: faint }}> · {cell.pct == null ? "no pctl" : `${cell.pct}`}</span>
      <span className="block text-[9px]" style={{ color: faint }}>{cell.exposure}</span>
    </span>
  );
}

function Comparison({ option, latestGp, latestAt }: { option: EvolutionOption; latestGp: number | null; latestAt: number | null }) {
  const { rows } = option;
  const allMissing = (cells: ComparisonCell[]) => cells.every(c => c.pct == null);
  const drawChart = !allMissing(rows.map(r => r.later)) && !allMissing(rows.map(r => r.earlier));
  const missingNotes = rows.flatMap(r => [
    r.earlier.missing ? `${r.label} at ${option.earlier.label}: ${r.earlier.missing}.` : null,
    r.later.missing ? `${r.label} now: ${r.later.missing}.` : null,
  ]).filter((x): x is string => x !== null);
  const summaries = rows.map(r => r.summary).filter((x): x is string => x !== null);
  const latestLabel = `Latest · ${latestGp ?? "?"} GP`;

  return (
    <div>
      {drawChart ? (
        <StrandDisplay
          ariaDescription={`${latestLabel} compared with ${option.earlier.label}`}
          offTraits={railOf(rows, "production").map(r => toTrait(r, r.later))}
          defTraits={railOf(rows, "usage").map(r => toTrait(r, r.later))}
          compareOff={railOf(rows, "production").map(r => toTrait(r, r.earlier))}
          compareDef={railOf(rows, "usage").map(r => toTrait(r, r.earlier))}
          compareLabel={option.earlier.label}
          railNames={{ off: "Production traits", def: "Usage traits" }}
          legend={
            <p className="mt-2 text-[10px] leading-snug font-mono" style={{ color: body }}>
              <strong>Solid</strong> = latest ({latestGp ?? "?"} GP). <strong>Dashed</strong> = {option.earlier.label}.{" "}
              Big number = percentile (0–100) inside the reference cohort named below, not against the whole NHL.
              Blue = production traits, red = usage traits; colour marks the family, never good or bad. Nothing is
              measured between the two profiles.
            </p>
          }
          W={300} H={200} amplitude={42} maxWidth={460}
        />
      ) : (
        <p className="text-[11px] font-mono leading-relaxed" style={{ color: body }}>
          No reference cohort with enough players is available for these profiles, so there is no percentile shape to draw. The raw rates are below.
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <caption className="text-left text-[9px] font-black uppercase tracking-[0.14em] pb-1" style={{ color: faint }}>
            Raw rate · percentile, earlier vs latest
          </caption>
          <thead>
            <tr style={{ borderBottom: `1px solid ${rule}` }}>
              <th scope="col" className="text-left py-1 pr-2">Trait</th>
              <th scope="col" className="text-left px-1">{option.earlier.label}</th>
              <th scope="col" className="text-left px-1">{latestLabel}</th>
              <th scope="col" className="text-right pl-1">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} style={{ borderBottom: `1px solid var(--ledger-rule-light, ${rule})`, verticalAlign: "top" }}>
                <th scope="row" className="text-left py-1 pr-2 font-black">
                  {r.label}
                  <span className="block text-[9px] font-normal" style={{ color: faint }}>{r.unit}<span className="hidden sm:inline"> · {r.source}</span></span>
                </th>
                <td className="px-1 py-1 tabular-nums"><Cell row={r} cell={r.earlier} /></td>
                <td className="px-1 py-1 tabular-nums"><Cell row={r} cell={r.later} /></td>
                <td className="pl-1 py-1 text-right tabular-nums">
                  {r.delta == null ? "—" : signed(r.delta, TRAITS[r.key].digits)}
                  <span className="block text-[9px]" style={{ color: faint }}>
                    {r.pctDelta == null ? (option.sameCohort ? "" : "no pctl diff") : `${signed(r.pctDelta, 0)} pctl pts`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summaries.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-[11px] font-mono leading-relaxed" style={{ color: body }}>
          {summaries.map(s => <li key={s}>{s}</li>)}
        </ul>
      )}
      {option.caveat && (
        <p className="mt-2 text-[11px] font-mono font-black leading-relaxed" style={{ color: body }}>{option.caveat}</p>
      )}
      <div className="mt-2 text-[10px] font-mono leading-relaxed" style={{ color: faint }}>
        <p>{option.cohortNote}</p>
        <p>{option.provenanceNote}</p>
        <p>Latest: {latestGp ?? "?"} GP, read {dateOf(latestAt)} (when the app read the NHL feeds; the feeds carry no as-of time).</p>
        {option.revisionNote && <p>{option.revisionNote}</p>}
        {option.withheldNotes.map(n => <p key={n}>{n}</p>)}
        {missingNotes.length > 0 && (
          <details>
            <summary className="cursor-pointer font-black" style={{ minHeight: 24 }}>Missing data ({missingNotes.length})</summary>
            <ul className="list-disc pl-4">{missingNotes.map(n => <li key={n}>{n}</li>)}</ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      className="font-mono text-[11px] font-black uppercase tracking-[0.08em] px-3 border"
      style={{
        minHeight: 44, borderColor: "var(--ledger-ink)", borderWidth: pressed ? 3 : 1,
        background: pressed ? "var(--ledger-cream)" : "var(--paper-bg)", color: "var(--ledger-ink)",
      }}>
      {pressed ? "✓ " : ""}{children}
    </button>
  );
}

export default function StrandEvolution({ view }: { view: EvolutionView }) {
  const checkpoints = view.options.filter(o => o.kind === "checkpoint");
  const baseline = view.options.find(o => o.kind === "baseline") ?? null;
  const [mode, setMode] = useState<"season" | "baseline">("season");
  const [cpId, setCpId] = useState<string>(checkpoints[0]?.id ?? "");
  const cp = checkpoints.find(o => o.id === cpId) ?? checkpoints[0] ?? null;
  const shown = mode === "season" ? cp : baseline;

  return (
    <section aria-label="Season profile evolution" className="border p-4 mb-4" style={{ borderColor: rule, background: "var(--paper-card, var(--paper-inset))" }}>
      <div className="text-[9px] font-black font-mono uppercase tracking-[0.18em]" style={{ color: faint }}>Season profile evolution · current-season observations</div>
      <p className="mt-1 mb-3 text-[10px] font-mono leading-relaxed" style={{ color: faint }}>
        Observed rates for {view.seasonLabel}: points, ice time, shots, high-danger shots and offensive-zone time.
        This is <strong>not</strong> the eight-trait STRAND above, which is the historical analytical profile
        built from the 2025–26 baseline and does not update during the season. Descriptive only; it is not part
        of NAV and does not say whether a player has changed in ability.
      </p>

      {!view.supported ? (
        <p className="text-[11px] font-mono leading-relaxed" style={{ color: body }}>{view.unsupportedReason}</p>
      ) : !view.latest ? (
        <p className="text-[11px] font-mono leading-relaxed" style={{ color: body }}>
          No current sample is available for this selection (the NHL summary was unreachable or the player has not played). Nothing from another season is substituted.
        </p>
      ) : (
        <>
          <div role="group" aria-label="Context" className="flex flex-wrap gap-2 mb-3">
            <Toggle pressed={mode === "season"} onClick={() => setMode("season")}>This season</Toggle>
            <Toggle pressed={mode === "baseline"} onClick={() => setMode("baseline")} >Historical baseline</Toggle>
          </div>

          {mode === "season" && (
            checkpoints.length > 0 && cp ? (
              <div className="mb-3">
                <label htmlFor="evo-checkpoint" className="block text-[9px] font-black font-mono uppercase tracking-[0.14em] mb-1" style={{ color: faint }}>
                  Compare latest with
                </label>
                <select id="evo-checkpoint" value={cp.id} onChange={e => setCpId(e.target.value)}
                  className="font-mono text-[12px] font-bold px-2 border rounded-none w-full"
                  style={{ minHeight: 44, maxWidth: 360, background: "var(--paper-bg)", color: "var(--ledger-ink)", borderColor: rule }}>
                  {checkpoints.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                {view.missingMilestones.length > 0 && (
                  <p className="mt-1 text-[10px] font-mono" style={{ color: faint }}>
                    Not captured, so not offered: {view.missingMilestones.map(m => `${m} GP`).join(", ")}. A missing checkpoint is never rebuilt from today&apos;s totals.
                  </p>
                )}
              </div>
            ) : (
              <p className="mb-3 text-[11px] font-mono leading-relaxed" style={{ color: body }}>
                {view.storeUnavailable
                  ? "The checkpoint store is not available yet, so only the latest sample can be shown."
                  : `No checkpoint has been captured for ${view.seasonLabel} yet (targets: 10, 20, 40, 60 GP and season end). Only the latest sample exists, so there is nothing to compare it with this season.`}
                {" "}Use <strong>Historical baseline</strong> to compare with last season&apos;s full-season rates.
              </p>
            )
          )}

          {mode === "baseline" && !baseline && (
            <p className="mb-3 text-[11px] font-mono leading-relaxed" style={{ color: body }}>
              No prior-season baseline is available for this player and selection.
            </p>
          )}

          {shown && <Comparison option={shown} latestGp={view.latest.gp} latestAt={view.latest.capturedAt} />}

          {mode === "season" && !shown && (
            <div className="text-[11px] font-mono leading-relaxed" style={{ color: body }}>
              Latest sample: {view.latest.gp ?? "?"} GP.{" "}
              {TRAIT_KEYS.map(k => `${TRAITS[k].label} ${formatTrait(k, view.latest!.traits[k].value)}`).join(" · ")}
            </div>
          )}
        </>
      )}

      <details className="mt-3 text-[10px] font-mono leading-relaxed" style={{ color: faint }}>
        <summary className="cursor-pointer font-black" style={{ minHeight: 24 }}>
          Original STRAND traits with no current-season source ({view.unavailableTraits.length})
        </summary>
        <p className="mt-1">These stay on the main STRAND, built from the 2025–26 baseline. They are not mixed into this panel or shown as current, so most of the original STRAND does not evolve here.</p>
        <ul className="list-disc pl-4">
          {view.unavailableTraits.map(t => <li key={t.label}><strong>{t.label}</strong>: {t.reason}</li>)}
        </ul>
      </details>
    </section>
  );
}
