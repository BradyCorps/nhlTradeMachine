"use client";
// ── CardStrandCompare — STRAND DNA on the shareable player card ───
//
// Reuses StrandView, so the rails come from the same league percentile cohort
// as the dossier and every other STRAND surface — no second derivation. The
// comparison is chosen by typing a name: at most six same-position matches are
// offered as buttons, rather than a select holding the whole league, which is
// unusable at phone width. Display-only; nothing here feeds a valuation.
import React, { useId, useMemo, useState } from "react";
import StrandView from "@/app/components/StrandView";
import { filterPlayersBySearch } from "@/app/lib/player-search";
import { posGroupOf } from "@/app/lib/strand-cohort";
import type { Asset } from "@/app/lib/trade-types";

const MAX_MATCHES = 6;
const MIN_QUERY = 2;

interface ComparablePlayer {
  id: string;
  name: string;
  teamId: string;
  position: string;
}

export default function CardStrandCompare<T extends ComparablePlayer>({ player, allPlayers }: {
  player: T;
  allPlayers: readonly T[];
}) {
  const [query, setQuery] = useState("");
  const [compareId, setCompareId] = useState<string | null>(null);
  const id = useId();
  const group = posGroupOf(player.position);

  // Same position group only: STRAND rails differ by group (goalies use 3×3),
  // so a forward overlaid on a goalie would compare different traits.
  const pool = useMemo(
    () => allPlayers.filter(p => p.id !== player.id && posGroupOf(p.position) === group),
    [allPlayers, player.id, group],
  );
  const matches = useMemo(
    () => query.trim().length < MIN_QUERY ? [] : filterPlayersBySearch(pool, query, p => p.teamId).slice(0, MAX_MATCHES),
    [pool, query],
  );
  const compare = compareId ? pool.find(p => p.id === compareId) ?? null : null;
  const groupNoun = group === "G" ? "goalie" : group === "D" ? "defenceman" : "forward";

  return (
    <section className="card-strand" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="card-strand-title">STRAND DNA</h3>
      <div className="card-strand-search">
        <label htmlFor={`${id}-q`}>Compare with another {groupNoun}</label>
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Type a name or team"
          autoComplete="off"
          aria-controls={matches.length > 0 ? `${id}-matches` : undefined}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="card-strand-hint" role="status">
          {query.trim().length < MIN_QUERY
            ? `Type at least ${MIN_QUERY} letters.`
            : matches.length === 0 ? `No ${groupNoun} matches “${query.trim()}”.` : `${matches.length} ${matches.length === 1 ? "match" : "matches"}.`}
        </p>
        {matches.length > 0 && (
          <ul id={`${id}-matches`} className="card-strand-matches">
            {matches.map(match => (
              <li key={match.id}>
                <button
                  type="button"
                  className="tap-target"
                  aria-pressed={compareId === match.id}
                  onClick={() => { setCompareId(match.id); setQuery(""); }}
                >
                  {match.name} <span>· {match.teamId}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {compare && (
          <p className="card-strand-comparing">
            Comparing with <strong>{compare.name}</strong>
            <button type="button" className="tap-target" onClick={() => setCompareId(null)} aria-label={`Stop comparing with ${compare.name}`}>
              Clear
            </button>
          </p>
        )}
      </div>
      <StrandView
        asset={player as unknown as Asset}
        compareAsset={compare as unknown as Asset | null}
      />
    </section>
  );
}
