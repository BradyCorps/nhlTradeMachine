"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TradePanel from "@/app/components/TradePanel";
import { fetchNavMap, fetchTradeVerdict } from "@/app/lib/evaluate-client";
import { SEASON } from "@/app/lib/season-config";
import type { Asset, Team, TradeVerdict } from "@/app/lib/trade-types";
import { adminErrorMessage, readAdminResponse } from "@/app/admin/admin-response";
import { useTradeStore } from "@/app/store/tradeStore";

type LeaguePayload = {
  teams: Team[];
  players: Asset[];
  capCeiling?: number | null;
};

type SaveResponse = {
  trade?: {
    id: string;
    published?: boolean;
    rosterMutating?: boolean;
    gradeAtTrade?: TradeGradeAtTrade | null;
  };
};

type TradeGradeAtTrade = {
  fairness: string;
  winner: string | null;
  perTeamNetNav: Record<string, number>;
};

type AdminTradeRecord = {
  id: string;
  executedDate: string;
  sourceUrl: string | null;
  season: string;
  sides: Array<{
    teamId: string;
    assetsGiven: Array<{
      kind: "player" | "pick";
      retainedPct?: number;
      inputSnapshot: Record<string, unknown>;
      navAtTrade: number | null;
    }>;
  }>;
  conditions: string | null;
  gradeAtTrade: TradeGradeAtTrade | null;
  published: boolean;
  rosterMutating: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

const fmt = (n: number): string => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export default function AdminTradesPage() {
  const [db, setDb] = useState<LeaguePayload>({ teams: [], players: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [executedDate, setExecutedDate] = useState(today);
  const [sourceUrl, setSourceUrl] = useState("");
  const [conditions, setConditions] = useState("");
  const [preview, setPreview] = useState<TradeVerdict | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPublished, setDraftPublished] = useState(false);
  const [draftRosterMutating, setDraftRosterMutating] = useState(true);
  const [trades, setTrades] = useState<AdminTradeRecord[]>([]);
  const [tradeActionId, setTradeActionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const teams = useTradeStore(s => s.teams);
  const blocks = useTradeStore(s => s.blocks);
  const setTeams = useTradeStore(s => s.setTeams);
  const setBlocks = useTradeStore(s => s.setBlocks);
  const navMap = useTradeStore(s => s.navMap);
  const setNavMap = useTradeStore(s => s.setNavMap);

  const homeTeam = teams[0];
  const partnerTeam = teams[1];
  const homeRoster = useMemo(() => db.players.filter(p => p.teamId === homeTeam?.id), [db.players, homeTeam?.id]);
  const partnerRoster = useMemo(() => db.players.filter(p => p.teamId === partnerTeam?.id), [db.players, partnerTeam?.id]);
  const homeNav = blocks[0].reduce((sum, asset) => sum + (navMap[asset.id]?.total ?? 0), 0);
  const partnerNav = blocks[1].reduce((sum, asset) => sum + (navMap[asset.id]?.total ?? 0), 0);
  const canPreview = Boolean(homeTeam && partnerTeam && blocks[0].length && blocks[1].length);

  const loadTrades = useCallback(async () => {
    const res = await fetch("/api/admin/trades");
    const data = await readAdminResponse<{ trades?: AdminTradeRecord[] }>(res, "Failed to load trade drafts");
    setTrades(data.trades ?? []);
  }, []);

  useEffect(() => {
    setTeams([null, null]);
    setBlocks([[], []]);
    setNavMap({});

    const ctrl = new AbortController();
    fetch("/api/league", { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`League data failed (HTTP ${res.status})`);
        return res.json() as Promise<LeaguePayload>;
      })
      .then(async (payload) => {
        setDb(payload);
        setNavMap(await fetchNavMap(payload.players, ctrl.signal, payload.capCeiling));
        await loadTrades();
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setError(adminErrorMessage(err, "Failed to load league data"));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [loadTrades, setBlocks, setNavMap, setTeams]);

  useEffect(() => {
    setPreview(null);
    setSavedId(null);
  }, [teams, blocks, executedDate, sourceUrl, conditions, draftPublished, draftRosterMutating]);

  const runPreview = useCallback(async () => {
    if (!homeTeam || !partnerTeam) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPreviewLoading(true);
    setError(null);

    try {
      const verdict = await fetchTradeVerdict(
        blocks[0],
        blocks[1],
        homeTeam,
        partnerTeam,
        homeRoster,
        partnerRoster,
        ctrl.signal,
        db.capCeiling,
      );
      setPreview(verdict);
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        setError(adminErrorMessage(err, "Failed to preview trade"));
      }
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setPreviewLoading(false);
      }
    }
  }, [blocks, db.capCeiling, homeRoster, homeTeam, partnerRoster, partnerTeam]);

  const saveDraft = useCallback(async () => {
    if (!homeTeam || !partnerTeam) return;
    setSaving(true);
    setError(null);
    setSavedId(null);

    try {
      const res = await fetch("/api/admin/trades", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          executedDate,
          sourceUrl,
          season: SEASON.label,
          conditions,
          published: draftPublished,
          rosterMutating: draftRosterMutating,
          capCeiling: db.capCeiling,
          sides: [
            { team: homeTeam, assetsGiven: blocks[0], fullRoster: homeRoster },
            { team: partnerTeam, assetsGiven: blocks[1], fullRoster: partnerRoster },
          ],
        }),
      });
      const data = await readAdminResponse<SaveResponse>(res, "Failed to save trade draft");
      setSavedId(data.trade?.id ?? "saved");
      setEditingId(data.trade?.id ?? editingId);
      setDraftPublished(Boolean(data.trade?.published ?? draftPublished));
      setDraftRosterMutating(Boolean(data.trade?.rosterMutating ?? draftRosterMutating));
      await loadTrades();
    } catch (err) {
      setError(adminErrorMessage(err, "Failed to save trade draft"));
    } finally {
      setSaving(false);
    }
  }, [blocks, conditions, db.capCeiling, draftPublished, draftRosterMutating, editingId, executedDate, homeRoster, homeTeam, loadTrades, partnerRoster, partnerTeam, sourceUrl]);

  const editTrade = useCallback((trade: AdminTradeRecord) => {
    const selectedTeams = trade.sides.map(side => db.teams.find(team => team.id === side.teamId) ?? null);
    const selectedBlocks = trade.sides.map(side => side.assetsGiven.map(asset => ({
      ...asset.inputSnapshot,
      retainedPct: asset.retainedPct ?? 0,
    } as unknown as Asset)));

    setEditingId(trade.id);
    setDraftPublished(trade.published);
    setDraftRosterMutating(trade.rosterMutating);
    setExecutedDate(trade.executedDate);
    setSourceUrl(trade.sourceUrl ?? "");
    setConditions(trade.conditions ?? "");
    setTeams([selectedTeams[0], selectedTeams[1]] as [Team | null, Team | null]);
    setBlocks([selectedBlocks[0] ?? [], selectedBlocks[1] ?? []] as [Asset[], Asset[]]);
    setSavedId(null);
    setPreview(null);
  }, [db.teams, setBlocks, setTeams]);

  const newDraft = useCallback(() => {
    setEditingId(null);
    setDraftPublished(false);
    setDraftRosterMutating(true);
    setExecutedDate(today());
    setSourceUrl("");
    setConditions("");
    setTeams([null, null]);
    setBlocks([[], []]);
    setSavedId(null);
    setPreview(null);
  }, [setBlocks, setTeams]);

  const togglePublished = useCallback(async (trade: AdminTradeRecord) => {
    setTradeActionId(trade.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/trades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trade.id, published: !trade.published, rosterMutating: trade.rosterMutating }),
      });
      await readAdminResponse(res, "Failed to update publish state");
      if (editingId === trade.id) setDraftPublished(!trade.published);
      await loadTrades();
    } catch (err) {
      setError(adminErrorMessage(err, "Failed to update publish state"));
    } finally {
      setTradeActionId(null);
    }
  }, [editingId, loadTrades]);

  return (
    <div style={{
      minHeight: "calc(100vh - 42px)",
      background: "var(--paper)",
      color: "var(--ledger-ink)",
      fontFamily: "'Courier Prime', monospace",
      padding: "32px",
    }}>
      <div style={{ maxWidth: 1180 }}>
        <div style={{ borderBottom: "1px solid var(--rule)", paddingBottom: 18, marginBottom: 24 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.35em", color: "var(--ledger-ink-faint)", marginBottom: 6 }}>
            ADMIN · THE DOCKET
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.08em" }}>
            TRADE INGESTION
          </div>
          <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)", marginTop: 6, lineHeight: 1.6 }}>
            Build a historical trade, preview the frozen grade, and save it as an unpublished draft.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.16em", color: "var(--ledger-ink-faint)" }}>
            {editingId ? `EDITING ${editingId}` : "NEW DRAFT"}
          </div>
          <button onClick={newDraft} className="btn-ink" style={{ padding: "8px 12px", fontSize: 10, fontWeight: 900, letterSpacing: "0.14em" }}>
            NEW DRAFT
          </button>
        </div>

        {error && (
          <div style={{ border: "1px solid var(--ledger-red)", color: "var(--ledger-red)", padding: 12, marginBottom: 16, fontSize: 11, fontWeight: 900 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 20 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.16em" }}>
            EXECUTED
            <input type="date" value={executedDate} onChange={e => setExecutedDate(e.target.value)}
              style={{ border: "1px solid var(--rule)", padding: "9px 10px", fontSize: 12, background: "var(--ledger-card)", color: "var(--ledger-ink)" }} />
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.16em", gridColumn: "span 2" }}>
            SOURCE URL
            <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://..."
              style={{ border: "1px solid var(--rule)", padding: "9px 10px", fontSize: 12, background: "var(--ledger-card)", color: "var(--ledger-ink)" }} />
          </label>
          <div style={{ border: "1px solid var(--rule)", padding: "10px 12px" }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.18em", color: "var(--ledger-ink-faint)" }}>DRAFT STATE</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{draftPublished ? "PUBLISHED" : "UNPUBLISHED"}</div>
          </div>
        </div>

        <label style={{
          border: "1px solid var(--rule)",
          padding: "10px 12px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.14em",
        }}>
          <span>
            <span style={{ display: "block" }}>ROSTER OVERLAY</span>
            <span style={{ display: "block", marginTop: 3, color: "var(--ledger-ink-faint)", letterSpacing: "0.08em", fontWeight: 700 }}>
              {draftRosterMutating ? "PUBLISHING MUTATES ROSTERS AND CAP" : "UI ONLY - NO ROSTER OR CAP CHANGE"}
            </span>
          </span>
          <input
            type="checkbox"
            checked={draftRosterMutating}
            onChange={e => setDraftRosterMutating(e.target.checked)}
            aria-label="Apply published trade to rosters and cap"
          />
        </label>

        <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.16em", marginBottom: 20 }}>
          CONDITIONS
          <textarea value={conditions} onChange={e => setConditions(e.target.value)} rows={3}
            style={{ border: "1px solid var(--rule)", padding: "10px", fontSize: 12, background: "var(--ledger-card)", color: "var(--ledger-ink)", resize: "vertical" }} />
        </label>

        {loading ? (
          <div style={{ border: "1px solid var(--rule)", padding: 28, fontSize: 11, fontWeight: 900, letterSpacing: "0.2em" }}>
            LOADING LEAGUE ASSETS
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
            <TradePanel idx={0} team={homeTeam} nav={homeNav} capSpace={homeTeam?.capSpace ?? 0} db={db} label="Team A gives" accent="A" />
            <TradePanel idx={1} team={partnerTeam} nav={partnerNav} capSpace={partnerTeam?.capSpace ?? 0} db={db} label="Team B gives" accent="B" />
          </div>
        )}

        <div style={{
          marginTop: 20,
          borderTop: "2px double var(--ledger-ink)",
          paddingTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 12,
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.2em", color: "var(--ledger-ink-faint)" }}>
              PREVIEW
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>
              {preview ? `${preview.status} · ${preview.message}` : canPreview ? `Net ${fmt(partnerNav - homeNav)} NAV before verdict` : "Select two teams and at least one asset per side"}
            </div>
            {savedId && (
              <div style={{ fontSize: 11, color: "var(--ledger-green)", marginTop: 6, fontWeight: 900 }}>
                Saved draft {savedId}
              </div>
            )}
          </div>
          <button
            onClick={runPreview}
            disabled={!canPreview || previewLoading}
            className="btn-ink"
            style={{ padding: "11px 16px", fontSize: 11, fontWeight: 900, letterSpacing: "0.16em", opacity: !canPreview || previewLoading ? 0.45 : 1 }}
          >
            {previewLoading ? "PREVIEWING" : "PREVIEW GRADE"}
          </button>
          <button
            onClick={saveDraft}
            disabled={!canPreview || saving}
            className="btn-ink"
            style={{ padding: "11px 16px", fontSize: 11, fontWeight: 900, letterSpacing: "0.16em", opacity: !canPreview || saving ? 0.45 : 1 }}
          >
            {saving ? "SAVING" : editingId ? "UPDATE DRAFT" : "SAVE DRAFT"}
          </button>
        </div>

        <div style={{ marginTop: 30, borderTop: "1px solid var(--rule)", paddingTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.18em", marginBottom: 12 }}>
            SAVED TRADES
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {trades.map(trade => (
              <div key={trade.id} style={{ border: "1px solid var(--rule)", padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900 }}>{trade.executedDate} · {trade.sides.map(side => side.teamId).join(" / ")}</div>
                  <div style={{ fontSize: 10, color: "var(--ledger-ink-faint)", marginTop: 3 }}>
                    {trade.published ? "PUBLISHED" : "DRAFT"} · {trade.rosterMutating ? "ROSTER" : "UI ONLY"} · {trade.gradeAtTrade?.fairness ?? "UNGRADED"} · {trade.id}
                  </div>
                </div>
                <button onClick={() => editTrade(trade)} className="btn-ink" style={{ padding: "8px 12px", fontSize: 10, fontWeight: 900, letterSpacing: "0.14em" }}>
                  EDIT
                </button>
                <button
                  onClick={() => togglePublished(trade)}
                  disabled={tradeActionId === trade.id}
                  className="btn-ink"
                  style={{ padding: "8px 12px", fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", opacity: tradeActionId === trade.id ? 0.45 : 1 }}
                >
                  {tradeActionId === trade.id ? "SAVING" : trade.published ? "UNPUBLISH" : "PUBLISH"}
                </button>
              </div>
            ))}
            {trades.length === 0 && (
              <div style={{ border: "1px dashed var(--rule)", padding: 18, fontSize: 11, color: "var(--ledger-ink-faint)" }}>
                No saved trades yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
