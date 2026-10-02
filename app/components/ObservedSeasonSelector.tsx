"use client";
import { useRouter } from "next/navigation";
import { OBSERVED_SEASONS, observedLabel, type ObservedSelection } from "@/app/lib/observed-season";

// Native selects preserve platform keyboard and mobile picker behavior.
export function ObservedSeasonSelector({ selection, onChange }: {
  selection: ObservedSelection; onChange?: (selection: ObservedSelection) => void;
}) {
  const router = useRouter();
  const change = (next: ObservedSelection) => {
    if (onChange) return onChange(next);
    const params = new URLSearchParams(window.location.search);
    params.set("season", next.season);
    params.set("gameType", String(next.gameType));
    router.replace(`${window.location.pathname}?${params}`, { scroll: false });
  };
  return <div className="flex flex-wrap items-center gap-3 my-3 text-[12px] font-mono">
    <label>Statistics season <select className="border p-2 min-h-[44px] text-base bg-transparent" aria-label="Statistics season"
      value={selection.season} onChange={e => change({ ...selection, season: e.target.value as ObservedSelection["season"] })}>
      {OBSERVED_SEASONS.map(season => <option key={season} value={season}>{observedLabel({ season, gameType: 2 }).replace(" regular season", "")}</option>)}
    </select></label>
    <label>Competition <select className="border p-2 min-h-[44px] text-base bg-transparent" aria-label="Statistics competition"
      value={selection.gameType} onChange={e => change({ ...selection, gameType: Number(e.target.value) as 2 | 3 })}>
      <option value="2">Regular season</option><option value="3">Playoffs</option>
    </select></label>
  </div>;
}
