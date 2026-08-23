"use client";
// ── useStrandCohort — the league percentile cohort for client STRAND surfaces ─
//
// The dossier builds its STRAND cohort on the server from the cached roster
// (buildStrandCohort). The trade machine, the docket and the trending panel have
// no roster in scope, so they read it here: ONE deduplicated fetch of
// /api/league/players — the SAME cached-roster source the dossier uses — held at
// module scope and shared by every consumer, exposed as the position-group
// cohorts strand-metrics ranks against. A player's percentile therefore matches
// the dossier wherever it is drawn, instead of the old min-max index that read a
// different number on every surface.

import { useEffect, useMemo, useState } from "react";
import type { PlayerLike } from "./strand-metrics";
import { cohortForGroup, posGroupOf, type PosGroup } from "./strand-cohort";

type Roster = Record<string, unknown>[];

// Module-scoped so a page full of asset cards triggers one request, not one per
// card. `cache` is the resolved roster; `inflight` dedupes concurrent mounts;
// subscribers are notified once when the single fetch resolves.
let cache: Roster | null = null;
let inflight: Promise<Roster> | null = null;
const subscribers = new Set<(roster: Roster) => void>();

function loadRoster(): Promise<Roster> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/league/players")
      .then(r => {
        if (!r.ok) throw new Error(`/api/league/players returned ${r.status}`);
        return r.json();
      })
      .then(d => {
        cache = Array.isArray(d?.players) ? (d.players as Roster) : [];
        subscribers.forEach(fn => fn(cache!));
        return cache!;
      })
      .catch(e => {
        inflight = null; // allow a later retry
        throw e;
      });
  }
  return inflight;
}

export function useStrandCohort(): {
  /** True once the league roster has loaded and cohorts are built. */
  ready: boolean;
  /** The cohort a player of this position is ranked against (empty until ready). */
  cohortFor: (player: { position: string }) => PlayerLike[];
} {
  const [roster, setRoster] = useState<Roster | null>(cache);

  useEffect(() => {
    if (cache) {
      setRoster(cache);
      return;
    }
    let alive = true;
    const onLoad = (r: Roster) => { if (alive) setRoster(r); };
    subscribers.add(onLoad);
    loadRoster().catch(() => {/* surfaces render "no data" if the roster fails */});
    return () => { alive = false; subscribers.delete(onLoad); };
  }, []);

  const cohorts = useMemo<Record<PosGroup, PlayerLike[]> | null>(() => {
    if (!roster) return null;
    return {
      F: cohortForGroup(roster, "F"),
      D: cohortForGroup(roster, "D"),
      G: cohortForGroup(roster, "G"),
    };
  }, [roster]);

  return {
    ready: cohorts != null,
    cohortFor: (player) => (cohorts ? cohorts[posGroupOf(player.position)] : []),
  };
}
