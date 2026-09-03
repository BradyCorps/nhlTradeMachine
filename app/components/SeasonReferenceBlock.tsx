import { buildSeasonReference } from "@/app/lib/season-snapshot";

/**
 * Read-only season identity for a player or team view. Names the projected
 * season and the completed stats season separately so no surface can imply a
 * 2026-27 result before a 2026-27 game has been played. Server component;
 * no data fetching.
 */
export function SeasonReferenceBlock({ valuationSnapshotId }: { valuationSnapshotId?: string | null }) {
  const ref = buildSeasonReference();
  const items: Array<[string, string]> = [
    ["Projected season", `${ref.projectedSeason} · ${ref.projectedSeasonGamesObserved} GP observed`],
    ["Stats baseline", `${ref.statsSeason} · completed`],
    ["Contracts", ref.contractSeason],
    ["Model", ref.modelVersion],
    ["Struck", ref.valuationAsOf],
  ];
  if (valuationSnapshotId) items.push(["Valuation id", valuationSnapshotId]);
  return (
    <section
      aria-label="Season reference"
      className="border px-3 py-2 mb-4 font-mono"
      style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
    >
      <div className="text-[9px] font-black uppercase tracking-[0.18em] mb-1" style={{ color: "var(--ledger-ink-faint)" }}>
        Season reference
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] leading-relaxed min-w-0" style={{ color: "var(--ledger-ink-faint)" }}>
        {items.map(([label, value]) => (
          <div key={label} className="flex gap-1 min-w-0">
            <dt className="font-black uppercase tracking-[0.08em] whitespace-nowrap">{label}:</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
