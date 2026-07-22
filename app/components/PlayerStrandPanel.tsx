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
import { buildAssetTraits, buildGoalieStrandTraits, computeStrandType } from "@/app/components/StrandView";
import type { Asset } from "@/app/lib/trade-types";

const STRAND_NAV_SHIM = { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0, fmvAav: 0, fArchetype: undefined, rosterTier: undefined } as const;

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
}: {
  player: any;
  peers?: StrandComparePeer[];
}) {
  const [compareId, setCompareId] = useState<string>("");
  const isGoalie = player.position === "G";

  const comparePeer = useMemo(
    () => peers.find(p => p.id === compareId) ?? null,
    [peers, compareId],
  );

  const compare = useMemo(() => {
    if (!comparePeer) return null;
    const traits = isGoalie
      ? buildGoalieStrandTraits(comparePeer)
      : buildAssetTraits(comparePeer as unknown as Asset, STRAND_NAV_SHIM);
    return { ...traits, label: comparePeer.name.split(" ").pop() };
  }, [comparePeer, isGoalie]);

  const primary = isGoalie
    ? buildGoalieStrandTraits(player)
    : buildAssetTraits(player as unknown as Asset, STRAND_NAV_SHIM);
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
    </div>
  );
}
