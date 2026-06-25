"use client";

import React from "react";

// Free-agency status is now a fact on the players table (the single source of
// truth), managed directly in Contract Admin — there is no separate FA-override
// table at read time anymore. This page is kept as a signpost so old bookmarks
// and the admin dashboard still resolve.
export default function FaOverridesDeprecatedPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0f0c07", color: "#e4d8b8",
      fontFamily: "'Courier Prime', monospace", padding: "60px 24px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ fontSize: 11, color: "#8a7a5a", letterSpacing: "0.1em", marginBottom: 8 }}>
          ADMIN · FREE AGENTS
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.05em", marginBottom: 16 }}>
          Moved to Contract Admin
        </h1>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "#c8b890", marginBottom: 14 }}>
          Free-agency status (UFA / RFA / SIGNED / exclude) is now stored on each player&apos;s
          row in the <strong>players</strong> table — the single source of truth the app reads
          from. Manage it directly in Contract Admin:
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.7, color: "#a89870", marginBottom: 24, paddingLeft: 18 }}>
          <li><strong>Edit</strong> any player → set FA status + expiry year, or exclude from roster.</li>
          <li><strong>⇪ Bulk Free Agents</strong> → paste a list and force a whole UFA/RFA class.</li>
          <li><strong>Load Baseline</strong> → reload the committed contract/FA seed.</li>
          <li><strong>Sync Live</strong> → refresh from CapWages (never clobbers editor-curated rows).</li>
        </ul>
        <a href="/admin/contracts"
          style={{ display: "inline-block", fontSize: 12, fontWeight: 900, letterSpacing: "0.1em",
            padding: "10px 18px", background: "#1e3a5f", border: "1px solid #2a5a8f",
            color: "#7ec8e3", textDecoration: "none" }}>
          → OPEN CONTRACT ADMIN
        </a>
      </div>
    </div>
  );
}
