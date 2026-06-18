"use client";

import React, { useEffect, useMemo, useState } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import type { Asset, Team, TradeVerdict } from "@/app/lib/trade-types";
import { fetchTradeVerdict } from "@/app/lib/evaluate-client";
import {
  createTradeSharePayload,
  encodeTradeSharePayload,
  resolveTradeShareAssets,
  type TradeSharePayload,
} from "@/app/lib/trade-share";

type LeagueData = { teams: Team[]; players: Asset[] };
type VerdictDisplay = Pick<TradeVerdict, "status" | "message" | "metrics"> & {
  flags: Array<Pick<TradeVerdict["flags"][number], "severity" | "headline" | "explanation">>;
};

const fmtCap = (value: number) => `$${value.toFixed(2)}M`;

function assetLabel(asset: Asset): string {
  if (asset.position === "Pick") {
    const round = asset.round === 1 ? "1st" : asset.round === 2 ? "2nd" : asset.round === 3 ? "3rd" : `${asset.round ?? ""}th`;
    return `${asset.year ?? ""} ${round} round pick`;
  }
  return `${asset.name} · ${asset.position} · ${fmtCap(asset.capHit)}`;
}

function TeamSelect({
  label,
  teams,
  value,
  excludeId,
  onChange,
}: {
  label: string;
  teams: Team[];
  value: string;
  excludeId?: string;
  onChange: (teamId: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full border px-3 py-3 text-[13px] font-black uppercase tracking-[0.08em] bg-transparent outline-none"
        style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
      >
        <option value="">Select team</option>
        {teams.filter(team => team.id !== excludeId).map(team => (
          <option key={team.id} value={team.id}>{team.name}</option>
        ))}
      </select>
    </label>
  );
}

function AssetPicker({
  label,
  team,
  assets,
  selected,
  onAdd,
}: {
  label: string;
  team: Team | null;
  assets: Asset[];
  selected: Asset[];
  onAdd: (asset: Asset) => void;
}) {
  const [assetId, setAssetId] = useState("");
  const available = useMemo(
    () => assets
      .filter(asset => asset.teamId === team?.id && !selected.some(item => item.id === asset.id))
      .sort((a, b) => {
        if (a.position === "Pick" && b.position !== "Pick") return 1;
        if (a.position !== "Pick" && b.position === "Pick") return -1;
        return a.name.localeCompare(b.name);
      }),
    [assets, selected, team?.id],
  );

  useEffect(() => setAssetId(""), [team?.id]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
        {label}
      </span>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          disabled={!team}
          value={assetId}
          onChange={event => setAssetId(event.target.value)}
          className="min-w-0 flex-1 border px-3 py-3 text-[12px] font-mono bg-transparent outline-none disabled:opacity-50"
          style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
        >
          <option value="">{team ? "Select asset" : "Select team first"}</option>
          {available.map(asset => (
            <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!assetId}
          onClick={() => {
            const asset = available.find(item => item.id === assetId);
            if (!asset) return;
            onAdd({ ...asset, retainedPct: 0 });
            setAssetId("");
          }}
          className="border px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] font-mono disabled:opacity-40"
          style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-brown)", background: "var(--ledger-warm)" }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function AssetList({
  title,
  assets,
  onRemove,
  onRetain,
}: {
  title: string;
  assets: Asset[];
  onRemove?: (assetId: string) => void;
  onRetain?: (assetId: string, retainedPct: number) => void;
}) {
  return (
    <div className="border min-h-[180px]" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}>
      <div className="px-4 py-2 border-b text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint"
        style={{ borderColor: "var(--ledger-rule)" }}>
        {title}
      </div>
      <div className="divide-y" style={{ borderColor: "var(--ledger-rule-light)" }}>
        {assets.length === 0 && (
          <div className="px-4 py-10 text-center text-[10px] font-black uppercase tracking-[0.2em] text-ledger-ink-faint">
            No assets selected
          </div>
        )}
        {assets.map(asset => (
          <div key={asset.id} className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-[13px] font-black truncate" style={{ color: "var(--ledger-ink)" }}>
                {asset.position === "Pick" ? assetLabel(asset) : asset.name}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-ledger-ink-faint">
                {asset.position === "Pick"
                  ? asset.teamId
                  : `${asset.position} · ${fmtCap(asset.capHit)} · ${asset.yearsRemaining}yr`}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {asset.position !== "Pick" && onRetain && (
                <select
                  value={Math.round((asset.retainedPct ?? 0) * 100)}
                  onChange={event => onRetain(asset.id, Number(event.target.value) / 100)}
                  className="border px-2 py-1 text-[10px] font-mono bg-transparent"
                  style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(value => (
                    <option key={value} value={value}>{value}% retained</option>
                  ))}
                </select>
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(asset.id)}
                  className="border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]"
                  style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-red)" }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-ledger-ink-faint">{label}</div>
      <div className="text-[15px] font-black" style={{ color: "var(--ledger-ink)" }}>{value}</div>
    </div>
  );
}

function VerdictSummary({ verdict }: { verdict: VerdictDisplay }) {
  const statusColor =
    verdict.status === "WIN" || verdict.status === "FAIR" ? "var(--ledger-green)" :
    verdict.status === "LOSS" ? "var(--ledger-amber)" :
    verdict.status === "BLOCKED" || verdict.status === "DECLINED" ? "var(--ledger-red)" :
    "var(--ledger-ink)";

  return (
    <div className="border p-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
            Locked Verdict
          </div>
          <div className="text-3xl font-black uppercase italic" style={{ color: statusColor }}>
            {verdict.status}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-right font-mono">
          <Metric label="NAV Out" value={verdict.metrics.navOut.toFixed(1)} />
          <Metric label="NAV In" value={verdict.metrics.navIn.toFixed(1)} />
          <Metric label="Net" value={verdict.metrics.homeNetGain.toFixed(1)} />
          <Metric label="Cap" value={`${verdict.metrics.capDelta.toFixed(1)}M`} />
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-body)" }}>
        {verdict.message}
      </p>
      {verdict.flags.length > 0 && (
        <div className="mt-4 space-y-2">
          {verdict.flags.slice(0, 4).map((flag, index) => (
            <div key={`${flag.headline}-${index}`} className="border px-3 py-2"
              style={{ borderColor: "var(--ledger-rule-light)", background: "var(--ledger-card)" }}>
              <div className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: "var(--ledger-ink)" }}>
                {flag.severity} · {flag.headline}
              </div>
              <div className="text-[11px] leading-relaxed text-ledger-ink-faint">
                {flag.explanation}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SharedTradeView({ code }: { code: string }) {
  const [payload, setPayload] = useState<TradeSharePayload | null>(null);
  const [data, setData] = useState<LeagueData>({ teams: [], players: [] });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    import("@/app/lib/trade-share")
      .then(({ decodeTradeSharePayload }) => {
        if (mounted) setPayload(decodeTradeSharePayload(code));
      })
      .catch(() => {
        if (mounted) setError("This trade link could not be decoded.");
      });
    return () => { mounted = false; };
  }, [code]);

  useEffect(() => {
    Promise.all([
      fetch("/api/league/teams").then(response => response.json()),
      fetch("/api/league/players").then(response => response.json()),
    ])
      .then(([teamData, playerData]) => {
        setData({ teams: teamData.teams ?? [], players: [...(playerData.players ?? []), ...(teamData.picks ?? [])] });
      })
      .catch(() => setError("Trade data could not be loaded."));
  }, []);

  const homeTeam = payload ? data.teams.find(team => team.id === payload.teams.homeTeamId) ?? null : null;
  const partnerTeam = payload ? data.teams.find(team => team.id === payload.teams.partnerTeamId) ?? null : null;
  const outgoing = payload ? resolveTradeShareAssets(payload.blocks.outgoing, data.players) : [];
  const incoming = payload ? resolveTradeShareAssets(payload.blocks.incoming, data.players) : [];

  return (
    <main className="min-h-screen font-serif antialiased" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <div className="relative w-full max-w-5xl mx-auto px-4 lg:px-6 py-6 lg:py-8 flex flex-col gap-5">
        <Header activeTab="trade" />
        <section className="border p-5 sm:p-6" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono text-ledger-ink-faint">
            Shared Trade
          </div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-black leading-none" style={{ color: "var(--ledger-ink)" }}>
            {homeTeam && partnerTeam ? `${homeTeam.name} / ${partnerTeam.name}` : "Reconstructing Trade"}
          </h1>
          {payload && (
            <p className="mt-3 text-[12px] font-mono uppercase tracking-[0.12em] text-ledger-ink-faint">
              Created {new Date(payload.createdAt).toLocaleDateString()} · Verdict locked at creation
            </p>
          )}
        </section>

        {error && (
          <div className="border p-4 text-[12px] font-black uppercase tracking-[0.18em]" style={{ borderColor: "var(--ledger-red)", color: "var(--ledger-red)" }}>
            {error}
          </div>
        )}

        {payload && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AssetList title={`${homeTeam?.name ?? payload.teams.homeTeamId} sends`} assets={outgoing} />
              <AssetList title={`${partnerTeam?.name ?? payload.teams.partnerTeamId} sends`} assets={incoming} />
            </div>
            {payload.lockedVerdict && <VerdictSummary verdict={payload.lockedVerdict} />}
          </>
        )}
        <Footer />
      </div>
    </main>
  );
}

export default function QuickTradeMachine() {
  const [data, setData] = useState<LeagueData>({ teams: [], players: [] });
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [homeTeamId, setHomeTeamId] = useState("");
  const [partnerTeamId, setPartnerTeamId] = useState("");
  const [outgoing, setOutgoing] = useState<Asset[]>([]);
  const [incoming, setIncoming] = useState<Asset[]>([]);
  const [verdict, setVerdict] = useState<TradeVerdict | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/league/teams").then(response => response.json()),
      fetch("/api/league/players").then(response => response.json()),
    ])
      .then(([teamData, playerData]) => {
        setData({ teams: teamData.teams ?? [], players: [...(playerData.players ?? []), ...(teamData.picks ?? [])] });
        setBooting(false);
      })
      .catch(event => {
        setError(`Trade data could not be loaded: ${event.message}`);
        setBooting(false);
      });
  }, []);

  const homeTeam = data.teams.find(team => team.id === homeTeamId) ?? null;
  const partnerTeam = data.teams.find(team => team.id === partnerTeamId) ?? null;
  const allHomeRoster = useMemo(() => data.players.filter(player => player.teamId === homeTeamId), [data.players, homeTeamId]);
  const allPartnerRoster = useMemo(() => data.players.filter(player => player.teamId === partnerTeamId), [data.players, partnerTeamId]);
  const canEvaluate = Boolean(homeTeam && partnerTeam && (outgoing.length || incoming.length));

  useEffect(() => {
    setOutgoing([]);
    setVerdict(null);
    setShareUrl("");
  }, [homeTeamId]);

  useEffect(() => {
    setIncoming([]);
    setVerdict(null);
    setShareUrl("");
  }, [partnerTeamId]);

  const runVerdict = async () => {
    if (!homeTeam || !partnerTeam || !canEvaluate) return;
    setEvaluating(true);
    setError(null);
    setShareUrl("");
    try {
      const nextVerdict = await fetchTradeVerdict(outgoing, incoming, homeTeam, partnerTeam, allHomeRoster, allPartnerRoster);
      setVerdict(nextVerdict);
    } catch (event: any) {
      setError(`Trade audit failed: ${event.message}`);
    } finally {
      setEvaluating(false);
    }
  };

  const createShare = () => {
    if (!homeTeam || !partnerTeam || !verdict) return;
    const payload = createTradeSharePayload({
      homeTeam,
      partnerTeam,
      outgoing,
      incoming,
      verdict,
      mode: "trade-machine",
      season: "2025-26",
    });
    const code = encodeTradeSharePayload(payload);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    setShareUrl(`${origin}/t/${code}`);
  };

  return (
    <main className="min-h-screen font-serif antialiased" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <div className="relative w-full max-w-6xl mx-auto px-4 lg:px-6 py-6 lg:py-8 flex flex-col gap-5">
        <Header activeTab="trade" />

        <section className="border p-5 sm:p-6" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] font-mono text-ledger-ink-faint">
            One-Off Trade Machine
          </div>
          <div className="mt-2 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-5xl font-black leading-none" style={{ color: "var(--ledger-ink)" }}>
                Build. Audit. Share.
              </h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--ledger-ink-body)" }}>
                Run a single trade without the full Armchair GM workspace. The verdict can be locked into a share link for Reddit, Discord, or group chat debate.
              </p>
            </div>
            <a
              href="/armchair-gm"
              className="border px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.22em] font-mono no-underline"
              style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-brown)", background: "var(--ledger-warm)" }}
            >
              Open Armchair GM
            </a>
          </div>
        </section>

        {error && (
          <div className="border p-4 text-[12px] font-black uppercase tracking-[0.18em]" style={{ borderColor: "var(--ledger-red)", color: "var(--ledger-red)" }}>
            {error}
          </div>
        )}

        {booting ? (
          <div className="border p-8 text-center text-[11px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint"
            style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
            Loading teams and assets
          </div>
        ) : (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border p-4 flex flex-col gap-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card-light)" }}>
                <TeamSelect label="Team sending assets" teams={data.teams} value={homeTeamId} excludeId={partnerTeamId} onChange={setHomeTeamId} />
                <AssetPicker label="Add outgoing asset" team={homeTeam} assets={data.players} selected={outgoing} onAdd={asset => setOutgoing(prev => [...prev, asset])} />
                <AssetList
                  title={homeTeam ? `${homeTeam.name} sends` : "Outgoing package"}
                  assets={outgoing}
                  onRemove={assetId => setOutgoing(prev => prev.filter(asset => asset.id !== assetId))}
                  onRetain={(assetId, retainedPct) => setOutgoing(prev => prev.map(asset => asset.id === assetId ? { ...asset, retainedPct } : asset))}
                />
              </div>
              <div className="border p-4 flex flex-col gap-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card-light)" }}>
                <TeamSelect label="Team sending return" teams={data.teams} value={partnerTeamId} excludeId={homeTeamId} onChange={setPartnerTeamId} />
                <AssetPicker label="Add incoming asset" team={partnerTeam} assets={data.players} selected={incoming} onAdd={asset => setIncoming(prev => [...prev, asset])} />
                <AssetList
                  title={partnerTeam ? `${partnerTeam.name} sends` : "Incoming package"}
                  assets={incoming}
                  onRemove={assetId => setIncoming(prev => prev.filter(asset => asset.id !== assetId))}
                  onRetain={(assetId, retainedPct) => setIncoming(prev => prev.map(asset => asset.id === assetId ? { ...asset, retainedPct } : asset))}
                />
              </div>
            </section>

            <section className="border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
              <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-ledger-ink-faint">
                {canEvaluate ? "Ready for GM Audit" : "Select two teams and at least one asset"}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={!canEvaluate || evaluating}
                  onClick={runVerdict}
                  className="px-5 py-3 text-[10px] font-black uppercase tracking-[0.22em] font-mono disabled:opacity-40"
                  style={{ background: "var(--ledger-red)", color: "white" }}
                >
                  {evaluating ? "Auditing" : "Run GM Audit"}
                </button>
                <button
                  type="button"
                  disabled={!verdict}
                  onClick={createShare}
                  className="border px-5 py-3 text-[10px] font-black uppercase tracking-[0.22em] font-mono disabled:opacity-40"
                  style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-brown)", background: "var(--ledger-warm)" }}
                >
                  Generate Share Link
                </button>
              </div>
            </section>

            {verdict && <VerdictSummary verdict={verdict} />}

            {shareUrl && (
              <section className="border p-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--ledger-card)" }}>
                <div className="text-[10px] font-black uppercase tracking-[0.25em] font-mono text-ledger-ink-faint">
                  Share Link
                </div>
                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 min-w-0 border px-3 py-3 text-[11px] font-mono bg-transparent"
                    style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(shareUrl)}
                    className="border px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] font-mono"
                    style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-brown)", background: "var(--ledger-warm)" }}
                  >
                    Copy
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        <Footer />
      </div>
    </main>
  );
}
