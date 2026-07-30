"use client";
// ── PlayerAvatar — photographed where we can, drawn where we can't ──
//
// One component stands for a player everywhere on the site, so the imagery
// policy is decided here once instead of at forty call sites.
//
// WHAT IT SHOWS
//
// A mugshot hotlinked from the league's public asset host when one resolves,
// and an engraved bust with the player's initials when none does. The bust is
// not a placeholder for a slow load — it is the answer for every DB-only
// prospect and bulk free agent the roster feed never covered, and for any
// season/club a mug was never minted for, so it has to look deliberate. It
// does: a newspaper of this era ran engraved busts and set initials in type.
//
// WHAT IT NEVER DOES
//
// Reach the export. The downloadable card is rendered server-side from
// `CardData`, which has no image field, and draws `playerAvatarSvgMarkup`
// below — the same bust, with literal colours because the export has no CSS
// custom properties. That function must stay photo-free: the site displaying
// the league's image from the league's server is one thing, and baking a copy
// into a branded PNG built to travel is another. See `app/lib/league-imagery.ts`
// for the policy in full.
//
// Photos are hotlinked, never proxied. Nothing is fetched by our servers and
// nothing is stored, so a file the league pulls disappears here too.

import React, { useMemo, useState } from "react";
import { candidateAt, headshotCandidates } from "@/app/lib/league-imagery";

const MONO = "'Courier Prime', monospace";

/** Two letters from a name, diacritics and punctuation ignored. */
export function initialsFor(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z' -]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface Props {
  name: string;
  /** Rendered pixel size; the SVG scales from a fixed 64-unit viewBox. */
  size?: number;
  /** Goalies get the mask outline, skaters the bare bust. */
  position?: string | null;
  className?: string;
  /** NHL player id. Name-slug ids (DB-only rows) are ignored, not requested. */
  playerId?: unknown;
  /** Three-letter club code — half the key a mugshot is filed under. */
  teamId?: unknown;
  /** The roster feed's own photo URL, where that feed covered this player. */
  headshot?: string | null;
  /**
   * The paper's default is a squared plate, matching every other framed
   * element on it. `"round"` exists for the two surfaces that were already
   * circular before photos came back — the players index and the dossier —
   * so restoring imagery doesn't quietly restyle them.
   */
  shape?: "square" | "round";
}

/** Corner radius in CSS pixels for a rendered box of `size`. */
const radiusFor = (shape: Props["shape"], size: number) => shape === "round" ? size / 2 : 2;

export function PlayerAvatar({
  name, size = 44, position, className, playerId, teamId, headshot, shape = "square",
}: Props) {
  const candidates = useMemo(
    () => headshotCandidates({ id: playerId, teamId, headshot }),
    [playerId, teamId, headshot],
  );

  // Keyed by the candidate list, so a virtualised row reused for a different
  // player starts its walk over instead of inheriting the last one's failures.
  const key = candidates.join("|");
  const [failed, setFailed] = useState<{ key: string; count: number }>({ key, count: 0 });
  const src = candidateAt(candidates, failed.key === key ? failed.count : 0);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- hotlinked, and
      // next/image would proxy it through our own origin, which is the thing
      // the policy avoids.
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={className}
        onError={() => setFailed(prev => (
          prev.key === key ? { key, count: prev.count + 1 } : { key, count: 1 }
        ))}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          display: "block",
          objectFit: "cover",
          borderRadius: radiusFor(shape, size),
          background: "var(--paper-inset)",
          border: "1px solid var(--ledger-rule)",
          // Pulls a full-colour cutout back onto the paper.
          filter: "sepia(0.28) contrast(1.04)",
        }}
      />
    );
  }

  return <DrawnAvatar name={name} size={size} position={position} className={className} shape={shape} />;
}

/** The engraved bust. Exported for the places that want it unconditionally. */
export function DrawnAvatar({ name, size = 44, position, className, shape = "square" }: Omit<Props, "playerId" | "teamId" | "headshot">) {
  const initials = initialsFor(name);
  const isGoalie = position === "G";
  // The viewBox is 64 units wide however many pixels it is drawn at.
  const rx = shape === "round" ? 32 : 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={name}
      style={{ flexShrink: 0, display: "block" }}
    >
      <rect width="64" height="64" rx={rx} fill="var(--paper-inset)" />
      <rect x="0.5" y="0.5" width="63" height="63" rx={rx} fill="none"
        stroke="var(--ledger-rule)" strokeWidth="1" />

      {/* Engraved bust: shoulders and head, no features — this is a placeholder
          for a person, not a likeness of one. */}
      <g fill="var(--ledger-ink)" opacity="0.13">
        <circle cx="32" cy="25" r="11" />
        <path d="M12 58c0-11 9-18 20-18s20 7 20 18z" />
      </g>

      {isGoalie && (
        // A cage, so the one position whose job looks different reads differently.
        <g stroke="var(--ledger-ink)" strokeWidth="1" opacity="0.22" fill="none">
          <path d="M23 22h18M23 26h18M23 30h18" />
          <path d="M27 18v16M32 18v16M37 18v16" />
        </g>
      )}

      <text
        x="32" y="34"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: MONO,
          fontSize: 20,
          fontWeight: 900,
          letterSpacing: "0.06em",
          fill: "var(--ledger-ink)",
        }}
      >
        {initials}
      </text>
    </svg>
  );
}

/**
 * Server-safe markup for the exported card, which renders outside React DOM.
 * Same drawing, literal colours — the export has no CSS custom properties.
 */
export function playerAvatarSvgMarkup(name: string, size = 96, position?: string | null): string {
  const initials = initialsFor(name);
  const cage = position === "G"
    ? `<g stroke="#1c140a" stroke-width="1" opacity="0.22" fill="none">
         <path d="M23 22h18M23 26h18M23 30h18"/>
         <path d="M27 18v16M32 18v16M37 18v16"/>
       </g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="2" fill="#efe7d5"/>
    <rect x="0.5" y="0.5" width="63" height="63" rx="2" fill="none" stroke="#b8a070" stroke-width="1"/>
    <g fill="#1c140a" opacity="0.13">
      <circle cx="32" cy="25" r="11"/>
      <path d="M12 58c0-11 9-18 20-18s20 7 20 18z"/>
    </g>
    ${cage}
    <text x="32" y="34" text-anchor="middle" dominant-baseline="middle"
      font-family="Courier Prime, monospace" font-size="20" font-weight="900" fill="#1c140a">${initials}</text>
  </svg>`;
}
