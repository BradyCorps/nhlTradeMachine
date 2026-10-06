import { buildSeasonReference } from "@/app/lib/season-snapshot";
import { seasonReferenceRows } from "@/app/lib/dossier-context";
import type { ObservedSelection } from "@/app/lib/observed-season";

/**
 * Read-only season identity for a player or team view. Names the selected
 * observations, the model's projected-season assumption and the completed stats season separately so no surface can imply a
 * 2026-27 result before a 2026-27 game has been played. Server component;
 * no data fetching.
 */
export function SeasonReferenceBlock({ valuationSnapshotId, selection, observedGames }: {
  valuationSnapshotId?: string | null;
  /** What the reader selected, and the games the NHL summary reports for it. */
  selection: ObservedSelection;
  observedGames: number | null;
}) {
  const ref = buildSeasonReference();
  const items: Array<[string, string]> = seasonReferenceRows({
    selection, observedGames,
    modelProjectedSeason: ref.projectedSeason,
    modelGames: ref.projectedSeasonGamesObserved,
    statsSeason: ref.statsSeason,
    contractSeason: ref.contractSeason,
    modelVersion: ref.modelVersion,
    computedOn: ref.valuationAsOf,
  }).map(r => [r.label, r.value]);
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
