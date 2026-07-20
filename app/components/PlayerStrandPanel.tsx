"use client";
// ── PlayerStrandPanel — the full STRAND surface for one player ──
// Lives on the /players/{nhlid} dossier (the index stays light).
// Skaters get the canonical trait build; goalies use the shared 3×3
// goalie model. Every strand renders the EDGE band beneath the shape.

import StrandDisplay from "@/app/components/StrandDisplay";
import EdgeStrip from "@/app/components/EdgeStrip";
import { buildAssetTraits, buildGoalieStrandTraits, computeStrandType } from "@/app/components/StrandView";
import type { Asset } from "@/app/lib/trade-types";

const STRAND_NAV_SHIM = { total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0, fmvAav: 0, fArchetype: undefined, rosterTier: undefined } as const;

export default function PlayerStrandPanel({ player }: { player: any }) {
  if (player.position === "G") {
    const goalie = buildGoalieStrandTraits(player);
    return (
      <StrandDisplay
        offTraits={goalie.off}
        defTraits={goalie.def}
        ops={null} dps={null}
        strandType="GOALTENDER"
        footer={<EdgeStrip asset={player} heading={false} />}
        W={300} H={200} amplitude={42} maxWidth={460}
      />
    );
  }

  const { off, def } = buildAssetTraits(player as unknown as Asset, STRAND_NAV_SHIM);
  const ops = player.ops ?? null;
  const dps = player.dps ?? null;
  const strandType = computeStrandType(off, def, ops, dps);

  return (
    <StrandDisplay
      offTraits={off}
      defTraits={def}
      ops={ops}
      dps={dps}
      strandType={strandType}
      footer={<EdgeStrip asset={player} heading={false} />}
      W={300} H={200} amplitude={42} maxWidth={460}
    />
  );
}
