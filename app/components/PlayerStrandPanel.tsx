"use client";
// ── PlayerStrandPanel — the full STRAND surface for one player ──
// Lives on the /players/{nhlid} dossier (the index stays light).
// Skaters get the canonical trait build; goalies use the shared 3×3
// goalie model. Every strand renders the EDGE band beneath the shape.
// PA5: an optional peer-compare dropdown overlays a second player's
// strand so two identities can be read against each other.

import { useMemo, useState } from "react";
import StrandDisplay from "@/app/components/StrandDisplay";
import EdgeStrip from "@/app/components/EdgeStrip";
import { computeStrandType } from "@/app/components/StrandView";
import { buildStrandPercentiles, type PlayerLike } from "@/app/lib/strand-metrics";

// Slim peer shape — only the fields the strand trait builds read, shipped
// from the server dossier so the client can overlay a comparison without
// another round-trip.
export interface StrandComparePeer {
  id: string;
  name: string;
  position: string;
  ops?: number | null;
  dps?: number | null;
  ptsPace?: number | null;
  xGPace?: number | null;
  xgRelTM?: number | null;
  avgTOI?: number | null;
  xgaRelTM?: number | null;
  qocIndex?: number | null;
  dzPct?: number | null;
  gsax?: number | null;
  savePct?: number | null;
  baselineHdsvPct?: number | null;
  gamesStarted?: number | null;
  games?: number | null;
  shotsPerGame?: number | null;
}

const faint = "var(--ledger-ink-faint)";
const rule = "var(--ledger-rule)";

export default function PlayerStrandPanel({
  player,
  peers = [],
  cohort = [],
  cohortLabel,
}: {
  player: any;
  peers?: StrandComparePeer[];
  /** Same-position, ≥20 GP field (incl. this player) — the cohort every rail's
   *  percentile is ranked against. The SAME cohort the percentile card uses, so
   *  the two surfaces always agree. */
  cohort?: PlayerLike[];
  cohortLabel?: string;
}) {
  const [compareId, setCompareId] = useState<string>("");
  const isGoalie = player.position === "G";

  const comparePeer = useMemo(
    () => peers.find(p => p.id === compareId) ?? null,
    [peers, compareId],
  );

  const compare = useMemo(() => {
    if (!comparePeer) return null;
    const traits = buildStrandPercentiles(comparePeer as unknown as PlayerLike, cohort, isGoalie);
    return { ...traits, label: comparePeer.name.split(" ").pop() };
  }, [comparePeer, cohort, isGoalie]);

  const primary = useMemo(
    () => buildStrandPercentiles(player as PlayerLike, cohort, isGoalie),
    [player, cohort, isGoalie],
  );
  const ops = isGoalie ? null : (player.ops ?? null);
  const dps = isGoalie ? null : (player.dps ?? null);
  const strandType = isGoalie
    ? "GOALTENDER"
    : computeStrandType(primary.off, primary.def, ops, dps);

  return (
    <div className="w-full flex flex-col items-center">
      {peers.length > 0 && (
        <div className="flex items-center gap-2 mb-3 self-stretch justify-center">
          <label htmlFor="strand-compare" className="text-[9px] font-black font-mono uppercase tracking-[0.14em]" style={{ color: faint }}>
            Compare
          </label>
          <select
            id="strand-compare"
            value={compareId}
            onChange={e => setCompareId(e.target.value)}
            className="font-mono text-[11px] font-bold px-2 py-1 border rounded-none"
            style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)", borderColor: rule, maxWidth: 260 }}
          >
            <option value="">— none —</option>
            {peers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {comparePeer && (
            <button
              type="button"
              onClick={() => setCompareId("")}
              aria-label="Clear comparison"
              className="font-mono text-[11px] font-black px-2 py-1 border"
              style={{ background: "var(--paper-bg)", color: "var(--ledger-red)", borderColor: rule }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      <StrandDisplay
        offTraits={primary.off}
        defTraits={primary.def}
        ops={ops}
        dps={dps}
        strandType={strandType}
        compareOff={compare?.off}
        compareDef={compare?.def}
        compareLabel={compare?.label}
        footer={<EdgeStrip asset={player} heading={false} />}
        W={300} H={200} amplitude={42} maxWidth={460}
      />
      {cohortLabel && (
        <div className="mt-1 text-[8px] font-mono uppercase tracking-[0.12em]" style={{ color: faint }}>
          Percentile rank vs {cohortLabel}
        </div>
      )}
    </div>
  );
}
