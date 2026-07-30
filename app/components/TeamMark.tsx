"use client";
// ── TeamMark — the club's own logo, set in type when it won't load ──
//
// Same policy as the player mugshot: the crest is hotlinked from the league's
// public asset host, so what renders is the league's file from the league's
// server, never a copy we hold. Nothing is proxied and nothing is cached.
//
// The three-letter abbreviation set in the masthead face remains underneath as
// the fallback, and it is a real answer rather than a broken-image box — it is
// unambiguous to any hockey fan, never 404s, and belongs to the paper. It is
// what shows for a club code the league has no crest filed under (a relocated
// franchise, an expansion placeholder) and what the exported card uses, which
// draws no league imagery at all.

import React, { useMemo, useState } from "react";
import { candidateAt, teamLogoCandidates } from "@/app/lib/league-imagery";

export function TeamMark({ id, size = 32 }: { id: string; size?: number }) {
  const candidates = useMemo(() => teamLogoCandidates(id), [id]);

  // Derived from the candidate list rather than held as a bare index, so a
  // dropdown row reused for another club restarts the walk.
  const key = candidates.join("|");
  const [failed, setFailed] = useState<{ key: string; count: number }>({ key, count: 0 });
  const src = candidateAt(candidates, failed.key === key ? failed.count : 0);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- hotlinked; these
      // are SVGs, which next/image refuses without `dangerouslyAllowSVG`.
      <img
        src={src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="shrink-0"
        onError={() => setFailed(prev => (
          prev.key === key ? { key, count: prev.count + 1 } : { key, count: 1 }
        ))}
        style={{ width: size, height: size, objectFit: "contain", display: "block" }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="shrink-0 inline-flex items-center justify-center font-mono font-black"
      style={{
        width: size, height: size,
        fontSize: Math.round(size * 0.34),
        letterSpacing: "0.04em",
        color: "var(--ledger-ink)",
        background: "var(--paper-inset)",
        border: "1px solid var(--ledger-rule)",
        borderRadius: 2,
      }}>
      {id}
    </span>
  );
}
