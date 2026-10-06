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
import PlayerPicker from "@/app/components/PlayerPicker";
import { computeStrandType, strandTypeBasis } from "@/app/lib/strand-type";
import { compareRows, eligibilityRule, type ExcludedPlayer } from "@/app/lib/strand-compare";
import { buildStrandPercentiles, type PlayerLike } from "@/app/lib/strand-metrics";

// Slim peer shape — only the fields the strand trait builds read, shipped
// from the server dossier so the client can overlay a comparison without
// another round-trip.
export interface StrandComparePeer {
  id: string;
  name: string;
  position: string;
  teamId?: string | null;
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
  excluded = [],
}: {
  player: any;
  peers?: StrandComparePeer[];
  /** Same-position, ≥20 GP field (incl. this player) — the cohort every rail's
   *  percentile is ranked against. The SAME cohort the percentile card uses, so
   *  the two surfaces always agree. */
  cohort?: PlayerLike[];
  cohortLabel?: string;
  /** Same-group players who cannot be compared, with the reason. */
  excluded?: ExcludedPlayer[];
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
        <div className="mb-3 self-stretch flex justify-center">
          <PlayerPicker
            label="Compare with"
            options={peers}
            excluded={excluded}
            value={compareId}
            onChange={setCompareId}
            rule={eligibilityRule(player)}
          />
        </div>
      )}

      <StrandDisplay
        ariaDescription={`${player.name} player profile STRAND`}
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
        <div className="mt-1 text-[9px] font-mono uppercase tracking-[0.12em]" style={{ color: faint }}>
          Percentile rank vs {cohortLabel}
        </div>
      )}
      {!isGoalie && (
        <p className="mt-2 max-w-[460px] text-[10px] font-mono leading-relaxed" style={{ color: faint }}>
          <strong>{strandType}</strong> — {strandTypeBasis(strandType)}
        </p>
      )}
      {compare && comparePeer && (
        <div className="mt-3 w-full overflow-x-auto" style={{ maxWidth: 460 }}>
          <table className="w-full text-[11px] font-mono border-collapse" style={{ color: "var(--ledger-ink)" }}>
            <caption className="text-left text-[9px] font-black uppercase tracking-[0.14em] pb-1" style={{ color: faint }}>
              Raw value and cohort percentile, same cohort for both
            </caption>
            <thead>
              <tr style={{ borderBottom: `1px solid ${rule}` }}>
                <th scope="col" className="text-left py-1 pr-2">Trait</th>
                <th scope="col" className="text-right px-1">{player.name.split(" ").pop()}</th>
                <th scope="col" className="text-right pl-1">{comparePeer.name.split(" ").pop()}</th>
              </tr>
            </thead>
            <tbody>
              {[...compareRows(primary.off, compare.off), ...compareRows(primary.def, compare.def)].map(r => (
                <tr key={r.label} style={{ borderBottom: `1px solid var(--ledger-rule-light, ${rule})` }}>
                  <th scope="row" className="text-left py-1 pr-2 font-black">{r.label}</th>
                  <td className="text-right px-1 tabular-nums">{r.rawA}<span style={{ color: faint }}> · {r.pctA == null ? "n/a" : `${r.pctA}`}</span></td>
                  <td className="text-right pl-1 tabular-nums">{r.rawB}<span style={{ color: faint }}> · {r.pctB == null ? "n/a" : `${r.pctB}`}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[9px]" style={{ color: faint }}>Each cell: raw value · percentile (0–100). n/a = not measured.</p>
        </div>
      )}
    </div>
  );
}
