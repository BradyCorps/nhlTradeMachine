import { calcNAV } from "@/app/lib/xnav-engine";
import type { AssetInput } from "@/app/lib/xnav-engine";

export interface TimelineYear {
  year:         number;  // 1-based contract year
  age:          number;
  nav:          number;  // projected total NAV
  off:          number;  // offensive component
  def:          number;  // defensive component
  capComponent: number;  // cap surplus/deficit component
  capHit:       number;  // actual cap hit that year
}

function skaterYearlyFactor(age: number): number {
  if (age < 22) return 1.04;
  if (age < 25) return 1.02;
  if (age < 28) return 1.00;
  if (age < 31) return 0.965;
  if (age < 34) return 0.93;
  return 0.88;
}

// Goalie curve from stability backtest (769 pairs, 2008-2025):
// peak ~28-30, gentler early decline, steepest drop at 34-36.
function goalieYearlyFactor(age: number): number {
  if (age < 24) return 1.02;
  if (age < 28) return 1.005;
  if (age < 31) return 1.00;
  if (age < 34) return 0.97;
  if (age < 37) return 0.955;
  return 0.92;
}

function productionMultiplier(baseAge: number, targetAge: number, isGoalie: boolean): number {
  const factor = isGoalie ? goalieYearlyFactor : skaterYearlyFactor;
  let m = 1.0;
  for (let a = baseAge; a < targetAge; a++) {
    m *= factor(a);
  }
  return m;
}

export function calcPlayerTimeline(asset: AssetInput): TimelineYear[] {
  const contractYears = Math.min(Math.max(asset.yearsRemaining ?? 1, 1), 6);
  const extYears      = (asset as any).extensionYears ?? 0;
  const extCapHit     = (asset as any).extensionCapHit ?? null;

  // Total years to project = current contract + extension (capped at 8 total)
  const totalYears = Math.min(contractYears + (extCapHit ? extYears : 0), 8);
  const isGoalie = asset.position === "G";
  const result: TimelineYear[] = [];

  for (let i = 0; i < totalYears; i++) {
    const age    = asset.age + i;
    const decay  = productionMultiplier(asset.age, age, isGoalie);
    const inExt  = i >= contractYears && extCapHit != null;
    const capHit = inExt ? extCapHit : asset.capHit;

    const projected: AssetInput = {
      ...asset,
      age,
      capHit,
      // After extension kicks in, yearsRemaining = extYears - years into extension
      yearsRemaining: inExt
        ? extYears - (i - contractYears)
        : contractYears - i,
      ptsPace:  Math.max(0, (asset.ptsPace  ?? 0) * decay),
      xGPace:   Math.max(0, (asset.xGPace   ?? 0) * decay),
      defRate:  Math.max(0, (asset.defRate  ?? 0) * decay),
      // Goalie decay applied to gsax
      gsax:     asset.gsax != null ? asset.gsax * decay : undefined,
      // Disable extension inside the projection loop — we already handle it above
      extensionCapHit: undefined,
      extensionYears:  undefined,
    };

    const nav = calcNAV(projected);

    result.push({
      year:         i + 1,
      age,
      nav:          Math.round(nav.total),
      off:          Math.round(nav.off),
      def:          Math.round(nav.def),
      capComponent: Math.round(nav.cap),
      capHit,
    });
  }

  return result;
}