"use client";
// ── PlayerAvatar — drawn, not photographed ───────────────────────
//
// Replaces NHL-hosted player photography everywhere it appeared.
//
// The photos were proxied same-origin AND inlined as data URLs into the
// exported shareable card, which is redistribution of league-owned imagery
// under our own brand — and the card is designed to travel, so the exposure was
// structural rather than incidental. A drawn mark removes the dependency
// completely: nothing is fetched, nothing is embedded, and the export has no
// third-party content in it at all.
//
// It also suits the paper better. A newspaper of this era ran engraved busts
// and set initials in type; a full-colour cutout was always the one element
// fighting the aesthetic.

import React from "react";

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
}

export function PlayerAvatar({ name, size = 44, position, className }: Props) {
  const initials = initialsFor(name);
  const isGoalie = position === "G";

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
      <rect width="64" height="64" rx="2" fill="var(--paper-inset)" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="2" fill="none"
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
