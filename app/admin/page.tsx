import React from "react";
import { db } from "@/app/db/client";
import { draftPickOverrides, players, teams, tradeBlock, siteSettings } from "@/app/db/schema";
import { SEASON } from "@/app/lib/season-config";

export const dynamic = "force-dynamic";

async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export default async function AdminDashboard() {
  const [allPlayers, tradeBlockRows, teamRows, settingsRows, draftPickRows] = await Promise.all([
    safeFetch(() => db.select({ id: players.id }).from(players), [] as { id: string }[]),
    safeFetch(() => db.select({ id: tradeBlock.id }).from(tradeBlock), [] as { id: string }[]),
    safeFetch(() => db.select({ id: teams.id, phase: teams.phaseOverride }).from(teams), [] as { id: string; phase: string | null }[]),
    safeFetch(() => db.select().from(siteSettings), [] as { key: string; value: string }[]),
    safeFetch(() => db.select({ id: draftPickOverrides.id }).from(draftPickOverrides), [] as { id: string }[]),
  ]);

  const playerCount       = allPlayers.length;
  const tradeBlockCount   = tradeBlockRows.length;
  const teamOverrideCount = teamRows.filter(t => t.phase).length;
  const hasCapOverride    = settingsRows.some(r => r.key === "cap_ceiling" || r.key === "cap_floor");
  const draftPickCount     = draftPickRows.length;

  const sections = [
    {
      href:  "/admin/contracts",
      label: "CONTRACTS",
      desc:  "Audit and override player contracts. Compare bundled vs scraped cap hits, flag deltas, add new players.",
      stat:  playerCount > 0 ? `${playerCount} players in DB` : "No players loaded",
    },
    {
      href:  "/admin/teams",
      label: "TEAMS",
      desc:  "Lock a team's build phase or override their standings position. Used when the record doesn't match the reality.",
      stat:  teamOverrideCount > 0 ? `${teamOverrideCount} active override${teamOverrideCount !== 1 ? "s" : ""}` : "No overrides — all auto",
    },
    {
      href:  "/admin/trade-block",
      label: "TRADE BLOCK",
      desc:  "Flag players as formally requested, available, or untouchable. Powers the Trade Block panel in Armchair GM.",
      stat:  tradeBlockCount > 0 ? `${tradeBlockCount} entr${tradeBlockCount !== 1 ? "ies" : "y"}` : "Empty",
    },
    {
      href:  "/admin/trades",
      label: "TRADE INGESTION",
      desc:  "Build a two-team trade with player, pick, and retention controls. Preview and save unpublished Docket drafts.",
      stat:  "Draft save flow",
    },
    {
      href:  "/admin/draft-picks",
      label: "DRAFT PICKS",
      desc:  "Move draft-pick ownership while keeping default pick inventory generated from league/team data.",
      stat:  draftPickCount > 0 ? `${draftPickCount} moved pick${draftPickCount !== 1 ? "s" : ""}` : "All default owners",
    },
    {
      href:  "/admin/health",
      label: "DATA HEALTH",
      desc:  "Check all external data sources (NHL API, MoneyPuck) and the contract baseline, prune stale DB rows, and re-seed.",
      stat:  "Health check · Prune · Seed",
    },
    {
      href:  "/admin/season-setup",
      label: "SEASON SETUP",
      desc:  "Configure the next season, manage the FA class, and run the rollover checklist. One place for everything that changes each September.",
      stat:  `Current: ${SEASON.label}`,
    },
    {
      href:  "/admin/settings",
      label: "SETTINGS",
      desc:  "Override the global cap ceiling and floor, clear caches, or hard reset admin data back to scrape defaults.",
      stat:  hasCapOverride ? "Cap override active" : "Using season defaults",
    },
  ];

  return (
    <div className="admin-page" style={{
      background: "var(--paper)",
      color: "var(--ledger-ink)",
      fontFamily: "'Courier Prime', monospace",
      minHeight: "calc(100vh - 42px)",
      padding: "36px 32px",
    }}>
      <div className="admin-dashboard-shell" style={{ maxWidth: 820 }}>

        {/* Page title */}
        <div style={{ borderBottom: "1px solid var(--rule)", paddingBottom: 20, marginBottom: 28 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.35em", color: "var(--ledger-ink-faint)", marginBottom: 6 }}>
            ADMIN
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.08em" }}>
            DASHBOARD
          </div>
          <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)", marginTop: 6, lineHeight: 1.6 }}>
            Manage player contracts, team overrides, trade block entries, and site configuration.
          </div>
        </div>

        {/* Stat strip */}
        <div className="admin-dashboard-stats" style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          background: "var(--rule)",
          border: "1px solid var(--rule)",
          marginBottom: 28,
        }}>
          {[
            { label: "PLAYERS IN DB",  value: String(playerCount)       },
            { label: "TRADE BLOCK",    value: String(tradeBlockCount)   },
            { label: "PICK MOVES",     value: String(draftPickCount)    },
            { label: "TEAM OVERRIDES", value: String(teamOverrideCount) },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--paper)", padding: "14px 18px" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "var(--ledger-ink-faint)", marginBottom: 5 }}>
                {label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.02em" }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Section cards */}
        <div className="admin-dashboard-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {sections.map(({ href, label, desc, stat }) => (
            <a
              key={href}
              href={href}
              style={{
                border: "1px solid var(--rule)",
                borderTop: "3px solid var(--ledger-ink)",
                padding: "18px 20px 16px",
                textDecoration: "none",
                color: "var(--ledger-ink)",
                display: "block",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.22em", marginBottom: 8 }}>
                {label} →
              </div>
              <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)", lineHeight: 1.65, marginBottom: 12 }}>
                {desc}
              </div>
              <div style={{
                fontSize: 9, fontWeight: 900, letterSpacing: "0.15em",
                color: "var(--ledger-ink-faint)", borderTop: "1px solid var(--rule)", paddingTop: 8,
              }}>
                {stat}
              </div>
            </a>
          ))}
        </div>

      </div>
    </div>
  );
}
