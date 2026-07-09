"use client";

import { useMemo, useState } from "react";
import { DevelopmentProfilePanel } from "@/app/components/DevelopmentProfilePanel";
import StrandDisplay from "@/app/components/StrandDisplay";
import { buildAssetTraits, computeStrandType } from "@/app/components/StrandView";
import EdgeStrip from "@/app/components/EdgeStrip";
import VerdictPanel, { STATUS_CONFIG } from "@/app/components/VerdictPanel";
import type { DocketEntry, DocketSortKey } from "@/app/lib/docket-view";
import { filterAndSortDocketEntries } from "@/app/lib/docket-view";
import type { Asset, XNAVResult } from "@/app/lib/trade-types";

const fmtNav = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;

const assetList = (entryPackage: DocketEntry["packages"][number]): string =>
  entryPackage.assets.length
    ? entryPackage.assets.map((asset) => {
      const retention = asset.retainedPct > 0 ? ` (${Math.round(asset.retainedPct * 100)}% retained)` : "";
      return `${asset.name}${retention}`;
    }).join(", ")
    : "Future considerations";

const navFromAsset = (navAtTrade: number | null): XNAVResult => ({
  total: navAtTrade ?? 0,
  off: 0,
  def: 0,
  age: 0,
  cap: 0,
  upside: 0,
});

type AssetTab = "STATS" | "STRAND" | "OUTLOOK";

function AssetStats({ asset, detailAsset, isPick }: {
  asset: DocketEntry["packages"][number]["assets"][number];
  detailAsset: Asset;
  isPick: boolean;
}) {
  const isGoalie = detailAsset.position === "G";
  const tiles: [string, string, string][] = isPick
    ? [["Today NAV", asset.navToday == null ? "NA" : fmtNav(asset.navToday), "NAV today"]]
    : isGoalie
      ? [
        ["Today NAV", asset.navToday == null ? "NA" : fmtNav(asset.navToday), "NAV today"],
        ["SV%", ((detailAsset.savePct ?? 0.9) * 100).toFixed(1), "Save percentage"],
        ["GS", String(detailAsset.gamesStarted ?? detailAsset.games ?? 0), "Games started"],
      ]
      : [
        ["Today NAV", asset.navToday == null ? "NA" : fmtNav(asset.navToday), "NAV today"],
        ["Pts/82", detailAsset.ptsPace.toFixed(1), "Points per 82 games"],
        ["Supp", detailAsset.defRate.toFixed(2), "Defensive suppression rate"],
        ["TOI", detailAsset.avgTOI.toFixed(1), "Average time on ice"],
      ];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(tiles.length, 4)}, minmax(0, 1fr))`, gap: 6 }}>
        {tiles.map(([label, value, title]) => (
          <div key={label} title={title} style={{ border: "1px solid var(--rule)", padding: "7px 8px" }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", color: "var(--ledger-ink-faint)" }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 900, marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>
      {isPick
        ? <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)", lineHeight: 1.5 }}>
            Pick value is the frozen pick-curve NAV captured at ingestion.
          </div>
        : <EdgeStrip asset={detailAsset} />}
    </div>
  );
}

function AssetDetail({ asset }: { asset: DocketEntry["packages"][number]["assets"][number] }) {
  const detailAsset = asset.currentAsset ?? asset.asset;
  const nav = navFromAsset(asset.navToday ?? asset.navAtTrade);
  const isPick = asset.kind === "pick" || detailAsset.position === "Pick";
  const isGoalie = detailAsset.position === "G";
  const traits = buildAssetTraits(detailAsset, nav);
  const strandType = isGoalie
    ? "GOALTENDER"
    : computeStrandType(traits.off, traits.def, detailAsset.ops ?? null, detailAsset.dps ?? null);
  const hasOutlook = !isPick && !isGoalie && Boolean(detailAsset.developmentProfile);

  // Tabs keep the card compact — one panel at a time instead of a wall of
  // strand + outlook for every player. Picks have only the STATS panel.
  const tabs: AssetTab[] = isPick
    ? ["STATS"]
    : hasOutlook ? ["STATS", "STRAND", "OUTLOOK"] : ["STATS", "STRAND"];
  const [tab, setTab] = useState<AssetTab>("STATS");
  const activeTab = tabs.includes(tab) ? tab : "STATS";

  return (
    <div style={{ border: "1px solid var(--rule)", padding: 10, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900 }}>{asset.name}</div>
          <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)", marginTop: 3 }}>
            {isPick ? "PICK CURVE NAV" : `${detailAsset.position} · AGE ${detailAsset.age || "NA"} · ${detailAsset.capHit.toFixed(2)}M`}
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 900, color: "var(--ledger-red)", whiteSpace: "nowrap", textAlign: "right" }}>
          <div>{fmtNav(asset.navAtTrade ?? 0)} AT TRADE</div>
          <div style={{ color: "var(--ledger-green)", marginTop: 2 }}>{asset.navToday == null ? "TODAY NA" : `${fmtNav(asset.navToday)} TODAY`}</div>
        </div>
      </div>

      {tabs.length > 1 && (
        <div role="tablist" aria-label={`${asset.name} detail sections`} style={{ display: "flex", gap: 4 }}>
          {tabs.map((t) => {
            const active = t === activeTab;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t)}
                className="tap-target"
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  fontFamily: "'Courier Prime', monospace",
                  cursor: "pointer",
                  background: active ? "var(--ledger-ink)" : "transparent",
                  color: active ? "var(--ledger-card-light)" : "var(--ledger-ink-faint)",
                  border: `1px solid ${active ? "var(--ledger-ink)" : "var(--rule)"}`,
                }}>
                {t}
              </button>
            );
          })}
        </div>
      )}

      {activeTab === "STATS" && <AssetStats asset={asset} detailAsset={detailAsset} isPick={isPick} />}

      {activeTab === "STRAND" && !isPick && (
        <StrandDisplay
          offTraits={traits.off}
          defTraits={traits.def}
          ops={detailAsset.ops ?? null}
          dps={detailAsset.dps ?? null}
          strandType={strandType}
          footer={<EdgeStrip asset={detailAsset} heading={false} />}
          W={280}
          H={200}
          amplitude={42}
        />
      )}

      {activeTab === "OUTLOOK" && hasOutlook && (
        <DevelopmentProfilePanel asset={detailAsset} />
      )}
    </div>
  );
}

function ExpandedEntry({ entry }: { entry: DocketEntry }) {
  const [expandedFlag, setExpandedFlag] = useState<number | null>(null);
  const verdict = entry.lockedVerdict;

  return (
    <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 12, display: "grid", gap: 12 }}>
      {verdict && (
        <VerdictPanel
          verdict={verdict}
          sc={STATUS_CONFIG[verdict.status]}
          expandedFlag={expandedFlag}
          setExpandedFlag={setExpandedFlag}
          onRequestClaudeAnalysis={() => undefined}
          onOpenMemo={() => undefined}
        />
      )}

      {entry.conditions && (
        <div style={{ border: "1px solid var(--rule)", padding: 10, fontSize: 11, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 900, letterSpacing: "0.12em" }}>CONDITIONS</span> · {entry.conditions}
        </div>
      )}

      <div className="docket-pkg-grid">
        {entry.packages.slice(0, 2).map(pkg => (
          <div key={pkg.teamId} style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.16em", color: "var(--ledger-ink-faint)" }}>
              {pkg.teamId} PACKAGE DETAIL
            </div>
            {pkg.assets.map(asset => <AssetDetail key={`${pkg.teamId}-${asset.name}`} asset={asset} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

interface DocketClientProps {
  entries: DocketEntry[];
}

export default function DocketClient({ entries }: DocketClientProps) {
  const [teamId, setTeamId] = useState("");
  const [winner, setWinner] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DocketSortKey>("date-desc");

  const teamOptions = useMemo(
    () => [...new Set(entries.flatMap(entry => entry.teams))].sort(),
    [entries],
  );
  const winnerOptions = useMemo(
    () => [...new Set(entries.map(entry => entry.winner ?? "EVEN"))].sort(),
    [entries],
  );
  const visibleEntries = useMemo(
    () => filterAndSortDocketEntries(entries, { teamId, winner, query, sort }),
    [entries, query, sort, teamId, winner],
  );

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="docket-filters">
        <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.16em" }}>
          SEARCH
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Player, team, verdict..."
            style={{ border: "1px solid var(--rule)", padding: "9px 10px", fontSize: 12, background: "var(--ledger-card)", color: "var(--ledger-ink)" }}
          />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.16em" }}>
          TEAM
          <select
            value={teamId}
            onChange={e => setTeamId(e.target.value)}
            style={{ border: "1px solid var(--rule)", padding: "9px 10px", fontSize: 12, background: "var(--ledger-card)", color: "var(--ledger-ink)" }}
          >
            <option value="">ALL</option>
            {teamOptions.map(team => <option key={team} value={team}>{team}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.16em" }}>
          WINNER
          <select
            value={winner}
            onChange={e => setWinner(e.target.value)}
            style={{ border: "1px solid var(--rule)", padding: "9px 10px", fontSize: 12, background: "var(--ledger-card)", color: "var(--ledger-ink)" }}
          >
            <option value="">ALL</option>
            {winnerOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.16em" }}>
          SORT
          <select
            value={sort}
            onChange={e => setSort(e.target.value as DocketSortKey)}
            style={{ border: "1px solid var(--rule)", padding: "9px 10px", fontSize: 12, background: "var(--ledger-card)", color: "var(--ledger-ink)" }}
          >
            <option value="date-desc">Newest</option>
            <option value="date-asc">Oldest</option>
            <option value="nav-desc">NAV margin high</option>
            <option value="nav-asc">NAV margin low</option>
            <option value="winner">Winner</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {visibleEntries.map(entry => (
          <article key={entry.id} style={{
            border: "1px solid var(--rule)",
            background: "var(--ledger-card)",
            padding: "14px 16px",
            display: "grid",
            gap: 12,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.1em" }}>
                  {entry.executedDate} · {entry.teams.join(" / ")}
                </div>
                <div style={{ marginTop: 4, fontSize: 10, color: "var(--ledger-ink-faint)", fontWeight: 900, letterSpacing: "0.12em" }}>
                  AT TRADE: {entry.fairness} · TODAY: {entry.todayWinner ?? "EVEN"} {entry.todayNavMargin == null ? "NA" : fmtNav(entry.todayNavMargin)} NAV · {entry.rosterMutating ? "ROSTER OVERLAY" : "UI ONLY"}
                </div>
              </div>
              <div style={{
                border: "1px solid var(--ledger-ink)",
                padding: "7px 10px",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.12em",
                whiteSpace: "nowrap",
              }}>
                <div>{entry.winner ?? "EVEN"} {fmtNav(entry.navMargin)} AT TRADE</div>
                <div style={{ color: "var(--ledger-green)", marginTop: 3 }}>{entry.todayWinner ?? "EVEN"} {entry.todayNavMargin == null ? "NA" : fmtNav(entry.todayNavMargin)} TODAY</div>
              </div>
            </div>

            <div className="docket-pkg-grid">
              {entry.packages.slice(0, 2).map(pkg => (
                <div key={pkg.teamId} style={{ borderTop: "1px solid var(--rule)", paddingTop: 9 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.16em", color: "var(--ledger-ink-faint)" }}>
                    {pkg.teamId} RECEIVED VALUE {fmtNav(pkg.navTotal)}
                  </div>
                  <div style={{ marginTop: 5, fontSize: 13, lineHeight: 1.45 }}>
                    {assetList(pkg)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)", lineHeight: 1.5 }}>
              At trade: {entry.atTradeVerdict} · Today: {entry.todayVerdict}
              {entry.sourceUrl && (
                <>
                  {" "}
                  <a href={entry.sourceUrl} style={{ color: "var(--ledger-red)", fontWeight: 900 }}>SOURCE</a>
                </>
              )}
            </div>

            <details>
              <summary style={{ cursor: "pointer", fontSize: 10, fontWeight: 900, letterSpacing: "0.16em", color: "var(--ledger-red)" }}>
                FULL RULING + PLAYER DETAIL
              </summary>
              <div style={{ marginTop: 12 }}>
                <ExpandedEntry entry={entry} />
              </div>
            </details>
          </article>
        ))}

        {visibleEntries.length === 0 && (
          <div style={{ border: "1px dashed var(--rule)", padding: 22, fontSize: 12, color: "var(--ledger-ink-faint)" }}>
            No published Docket entries match the current filters.
          </div>
        )}
      </div>
    </section>
  );
}
