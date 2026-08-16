"use client";

import React, { useEffect, useState, useCallback } from "react";
import { readAdminResponse, adminErrorMessage } from "../admin-response";
import { toast } from "@/app/lib/ledger-toast";

interface SeasonConfig {
  label: string;
  replaySeason: string;
  apiSeasonId: string;
  nhleSeasonId: string;
  mpSeason: string;
  capCeiling: number;
  capFloor: number;
  draftYear: number;
  firstTradablePickYear: number;
  latestCompleted: {
    season: string;
    stanleyCupChampion: { teamId: string; teamName: string };
    connSmythe: { name: string; teamId: string; teamName: string };
  };
}

interface Overrides {
  label: string | null;
  replaySeason: string | null;
  apiSeasonId: string | null;
  nhleSeasonId: string | null;
  mpSeason: string | null;
  capCeiling: string | null;
  capFloor: string | null;
  draftYear: string | null;
  firstTradablePickYear: string | null;
  cupChampionId: string | null;
  cupChampionName: string | null;
  connSmytheName: string | null;
  connSmytheTeamId: string | null;
  connSmytheTeamName: string | null;
}

interface FaClass {
  ufa: string[];
  rfa: string[];
}

interface SetupData {
  current: SeasonConfig;
  overrides: Overrides;
  faClass: FaClass;
  checklist: Record<string, boolean>;
}

const CHECKLIST_ITEMS = [
  { key: "config",      label: "Season config updated" },
  { key: "contracts",   label: "New contracts pasted / bundled" },
  { key: "fa_class",    label: "FA class defined for new season" },
  { key: "seed_built",  label: "League seed rebuilt" },
  { key: "seed_loaded", label: "Seed loaded into database" },
  { key: "caches",      label: "All caches cleared" },
  { key: "leadership",  label: "Captains & alternates refreshed (leadership.ts)" },
  { key: "draft_class", label: "Draft class files updated" },
  { key: "baselines",   label: "MoneyPuck & team baselines regenerated" },
  { key: "press_box",   label: "Press Box player pool refreshed" },
];

const CONFIG_FIELDS: { key: string; label: string; help: string; placeholder?: string }[] = [
  { key: "label",                 label: "SEASON LABEL",        help: "e.g. 2027-28" },
  { key: "replaySeason",          label: "REPLAY SEASON",       help: "Stats baseline (last completed), e.g. 2026-27" },
  { key: "apiSeasonId",           label: "API SEASON ID",       help: "NHL API season, e.g. 20272028" },
  { key: "nhleSeasonId",          label: "NHLE SEASON ID",      help: "NHL roster fallback (last completed), e.g. 20262027" },
  { key: "mpSeason",              label: "MONEYPUCK SEASON",    help: "MoneyPuck URL segment (last completed year), e.g. 2026" },
  { key: "capCeiling",            label: "CAP CEILING ($M)",    help: "Salary cap upper limit" },
  { key: "capFloor",              label: "CAP FLOOR ($M)",      help: "Salary cap lower limit" },
  { key: "draftYear",             label: "DRAFT YEAR",          help: "Draft Night projection year" },
  { key: "firstTradablePickYear", label: "FIRST TRADABLE PICK", help: "Earliest year whose picks still exist as assets" },
  { key: "cupChampionId",         label: "CUP CHAMPION CODE",   help: "Three-letter team code, e.g. CAR" },
  { key: "cupChampionName",       label: "CUP CHAMPION NAME",   help: "Full team name" },
  { key: "connSmytheName",        label: "CONN SMYTHE WINNER",  help: "Player name" },
  { key: "connSmytheTeamId",      label: "CONN SMYTHE TEAM",    help: "Three-letter team code" },
  { key: "connSmytheTeamName",    label: "CONN SMYTHE TEAM NAME", help: "Full team name" },
];

const inputStyle: React.CSSProperties = {
  background: "var(--paper)", border: "1px solid var(--rule)",
  color: "var(--ledger-ink)", padding: "7px 10px", fontSize: 12,
  fontFamily: "'Courier Prime', monospace", width: "100%",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "var(--ledger-ink)", border: "none",
  color: "var(--paper)", fontSize: 10, fontWeight: 900, cursor: "pointer",
  letterSpacing: "0.12em", fontFamily: "'Courier Prime', monospace",
};

const btnOutline: React.CSSProperties = {
  ...btnStyle, background: "transparent", border: "1px solid var(--rule)",
  color: "var(--ledger-ink-faint)",
};

function deriveFields(label: string): Partial<Record<string, string>> {
  const m = label.match(/^(\d{4})-(\d{2})$/);
  if (!m) return {};
  const startYear = parseInt(m[1], 10);
  const endShort = m[2];
  const endYear = parseInt(m[1].slice(0, 2) + endShort, 10);
  const prevStart = startYear - 1;
  const prevEnd = endShort === "00" ? "99" : String(parseInt(endShort, 10) - 1).padStart(2, "0");
  return {
    replaySeason: `${prevStart}-${prevEnd}`,
    apiSeasonId: `${startYear}${endYear}`,
    nhleSeasonId: `${prevStart}${startYear}`,
    mpSeason: String(prevStart),
    draftYear: String(startYear),
    firstTradablePickYear: String(startYear + 1),
  };
}

export default function SeasonSetupPage() {
  const [data, setData] = useState<SetupData | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [faUfa, setFaUfa] = useState("");
  const [faRfa, setFaRfa] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/season-setup")
      .then(r => r.json())
      .then((d: SetupData) => {
        setData(d);
        const initial: Record<string, string> = {};
        for (const f of CONFIG_FIELDS) {
          const ov = (d.overrides as unknown as Record<string, string | null>)[f.key];
          if (ov !== null && ov !== undefined) {
            initial[f.key] = ov;
          }
        }
        setForm(initial);
        setFaUfa(d.faClass.ufa.join("\n"));
        setFaRfa(d.faClass.rfa.join("\n"));
        setChecklist(d.checklist);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (key: string, val: string) => {
    const next = { ...form, [key]: val };
    if (key === "label" && val.match(/^\d{4}-\d{2}$/)) {
      const derived = deriveFields(val);
      for (const [dk, dv] of Object.entries(derived)) {
        if (!next[dk] || next[dk] === form[dk]) next[dk] = dv!;
      }
    }
    setForm(next);
  };

  const currentVal = (key: string): string => {
    if (!data) return "";
    const c = data.current;
    if (key === "cupChampionId") return c.latestCompleted.stanleyCupChampion.teamId;
    if (key === "cupChampionName") return c.latestCompleted.stanleyCupChampion.teamName;
    if (key === "connSmytheName") return c.latestCompleted.connSmythe.name;
    if (key === "connSmytheTeamId") return c.latestCompleted.connSmythe.teamId;
    if (key === "connSmytheTeamName") return c.latestCompleted.connSmythe.teamName;
    return String((c as unknown as Record<string, unknown>)[key] ?? "");
  };

  const saveConfig = async () => {
    setBusy(true);
    try {
      const config: Record<string, string | null> = {};
      for (const f of CONFIG_FIELDS) {
        const val = form[f.key]?.trim();
        config[f.key] = val || null;
      }
      const res = await fetch("/api/admin/season-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_config", config }),
      });
      await readAdminResponse(res, "Save failed");
      toast("Season config saved", "success");
      load();
    } catch (e) {
      toast(adminErrorMessage(e, "Save failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveFaClass = async () => {
    setBusy(true);
    try {
      const parse = (s: string) => s.split("\n").map(l => l.trim()).filter(Boolean);
      const faClass = { ufa: parse(faUfa), rfa: parse(faRfa) };
      const res = await fetch("/api/admin/season-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_fa_class", faClass }),
      });
      await readAdminResponse(res, "Save failed");
      toast(`FA class saved: ${faClass.ufa.length} UFA, ${faClass.rfa.length} RFA`, "success");
      load();
    } catch (e) {
      toast(adminErrorMessage(e, "Save failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleCheck = async (key: string) => {
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    try {
      const res = await fetch("/api/admin/season-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_checklist", checklist: next }),
      });
      await readAdminResponse(res, "Save failed");
    } catch (e) {
      toast(adminErrorMessage(e, "Checklist save failed"), "error");
    }
  };

  const loadSeed = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/season-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load_seed" }),
      });
      const result = await readAdminResponse<{ inserted?: number; updated?: number }>(res, "Seed load failed");
      toast(`Seed loaded: ${result.inserted ?? 0} inserted, ${result.updated ?? 0} updated`, "success");
    } catch (e) {
      toast(adminErrorMessage(e, "Seed load failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const clearCaches = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/season-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_caches" }),
      });
      const result = await readAdminResponse<{ cleared?: string[] }>(res, "Cache clear failed");
      toast(`Cleared ${result.cleared?.length ?? 0} cache keys`, "success");
    } catch (e) {
      toast(adminErrorMessage(e, "Cache clear failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const doneCount = CHECKLIST_ITEMS.filter(i => checklist[i.key]).length;
  const hasOverrides = Object.values(form).some(v => v?.trim());

  return (
    <div style={{ minHeight: "calc(100vh - 42px)", background: "var(--paper)", color: "var(--ledger-ink)", fontFamily: "'Courier Prime', monospace" }}>
      <div style={{ borderBottom: "1px solid var(--rule)", padding: "14px 24px" }}>
        <a href="/admin" style={{ fontSize: 9, letterSpacing: "0.3em", color: "var(--ledger-ink-faint)", textDecoration: "none" }}>ADMIN</a>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.18em", marginTop: 2 }}>SEASON SETUP</div>
      </div>

      <div style={{ maxWidth: 720, padding: "24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Current season overview */}
        <div style={{ border: "1px solid var(--rule)", borderTop: "3px solid var(--ledger-ink)", padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 14 }}>CURRENT SEASON</div>
          {data ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 20px" }}>
              {[
                ["Season", data.current.label],
                ["Stats baseline", data.current.replaySeason],
                ["Cap ceiling", `$${data.current.capCeiling}M`],
                ["Cap floor", `$${data.current.capFloor}M`],
                ["Draft year", String(data.current.draftYear)],
                ["Tradable picks from", String(data.current.firstTradablePickYear)],
                ["API season", data.current.apiSeasonId],
                ["NHLE season", data.current.nhleSeasonId],
                ["MoneyPuck", data.current.mpSeason],
                ["Cup champion", `${data.current.latestCompleted.stanleyCupChampion.teamName}`],
                ["Conn Smythe", `${data.current.latestCompleted.connSmythe.name}`],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 8, letterSpacing: "0.15em", color: "var(--ledger-ink-faint)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{val}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--ledger-ink-faint)" }}>Loading...</div>
          )}
          {hasOverrides && (
            <div style={{ marginTop: 14, padding: "8px 10px", background: "rgba(180,120,40,0.08)", border: "1px solid rgba(180,120,40,0.25)", fontSize: 9, letterSpacing: "0.08em", color: "var(--ledger-ink-body)" }}>
              Overrides are staged below. These are saved to the database but do not take effect until season-config.ts is updated and redeployed.
            </div>
          )}
        </div>

        {/* Rollover checklist */}
        <div style={{ border: "1px solid var(--rule)", padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em" }}>ROLLOVER CHECKLIST</div>
            <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--ledger-ink-faint)" }}>{doneCount}/{CHECKLIST_ITEMS.length}</div>
          </div>
          {CHECKLIST_ITEMS.map(item => (
            <label key={item.key} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 0", borderBottom: "1px solid var(--rule)",
              fontSize: 11, cursor: "pointer",
              color: checklist[item.key] ? "var(--ledger-ink-faint)" : "var(--ledger-ink)",
              textDecoration: checklist[item.key] ? "line-through" : "none",
            }}>
              <input type="checkbox" checked={!!checklist[item.key]} onChange={() => toggleCheck(item.key)} />
              {item.label}
            </label>
          ))}
        </div>

        {/* Season config form */}
        <div style={{ border: "1px solid var(--rule)", borderTop: "3px solid var(--ledger-ink)", padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>CONFIGURE NEXT SEASON</div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.06em", marginBottom: 16, lineHeight: 1.6 }}>
            Fill in the new season&apos;s values. Typing a season label (e.g. 2027-28) auto-derives the API IDs, MoneyPuck path, and draft year.
            Saved values are staged here for reference. To apply them, update season-config.ts with these values and redeploy.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 16 }}>
            {CONFIG_FIELDS.map(f => (
              <div key={f.key} style={f.key.startsWith("conn") || f.key.startsWith("cup") ? {} : {}}>
                <div style={{ fontSize: 8, letterSpacing: "0.15em", color: "var(--ledger-ink-faint)", marginBottom: 3 }}>
                  {f.label}
                </div>
                <input
                  value={form[f.key] ?? ""}
                  onChange={e => setField(f.key, e.target.value)}
                  placeholder={currentVal(f.key) || f.help}
                  style={inputStyle}
                />
                <div style={{ fontSize: 8, color: "var(--ledger-ink-faint)", marginTop: 2, opacity: 0.7 }}>{f.help}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveConfig} disabled={busy} style={btnStyle}>
              {busy ? "SAVING..." : "SAVE CONFIG"}
            </button>
            <button
              onClick={() => { setForm({}); }}
              style={btnOutline}
            >
              CLEAR FORM
            </button>
          </div>
        </div>

        {/* FA class editor */}
        <div style={{ border: "1px solid var(--rule)", borderTop: "3px solid var(--ledger-ink)", padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 4 }}>FREE AGENT CLASS</div>
          <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", letterSpacing: "0.06em", marginBottom: 16, lineHeight: 1.6 }}>
            One player name per line. This replaces the hardcoded list in free-agent-seed.ts for the seed builder.
            Save here, then rebuild and load the seed to apply.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.15em", color: "var(--ledger-ink-faint)", marginBottom: 4 }}>
                UFA ({faUfa.split("\n").filter(l => l.trim()).length})
              </div>
              <textarea
                value={faUfa}
                onChange={e => setFaUfa(e.target.value)}
                rows={12}
                placeholder={"Alex Tuch\nPatrick Kane\n..."}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.15em", color: "var(--ledger-ink-faint)", marginBottom: 4 }}>
                RFA ({faRfa.split("\n").filter(l => l.trim()).length})
              </div>
              <textarea
                value={faRfa}
                onChange={e => setFaRfa(e.target.value)}
                rows={12}
                placeholder={"Connor Bedard\nCutter Gauthier\n..."}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              />
            </div>
          </div>

          <button onClick={saveFaClass} disabled={busy} style={btnStyle}>
            {busy ? "SAVING..." : "SAVE FA CLASS"}
          </button>
        </div>

        {/* Actions */}
        <div style={{ border: "1px solid var(--rule)", padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", marginBottom: 14 }}>ROLLOVER ACTIONS</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={loadSeed} disabled={busy} style={btnStyle}>
                {busy ? "LOADING..." : "LOAD SEED"}
              </button>
              <span style={{ fontSize: 9, color: "var(--ledger-ink-faint)", lineHeight: 1.5 }}>
                Load league-seed.json into the database. Inserts missing players, fills FA marks on seed/sync rows, never touches editor rows.
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={clearCaches} disabled={busy} style={btnOutline}>
                {busy ? "CLEARING..." : "CLEAR ALL CACHES"}
              </button>
              <span style={{ fontSize: 9, color: "var(--ledger-ink-faint)", lineHeight: 1.5 }}>
                Bust Redis caches for contracts, rosters, MoneyPuck, and point shares. Do this after loading a new seed.
              </span>
            </div>
          </div>
        </div>

        {/* Guidance */}
        <div style={{ fontSize: 9, color: "var(--ledger-ink-faint)", lineHeight: 1.8, letterSpacing: "0.04em", padding: "0 2px 32px" }}>
          <strong style={{ letterSpacing: "0.12em" }}>ROLLOVER ORDER</strong><br />
          1. Fill in the next season&apos;s config above and save it.<br />
          2. Update season-config.ts with the saved values and redeploy.<br />
          3. Paste new contracts in the Contracts admin (or update contracts.bundled.json).<br />
          4. Define the new FA class above and save it.<br />
          5. Run <code style={{ background: "var(--rule)", padding: "1px 4px" }}>npx tsx scripts/build-league-seed.ts</code> to rebuild league-seed.json.<br />
          6. Load the seed and clear caches using the buttons above.<br />
          7. Refresh curated lists: leadership.ts, future-draft-classes.ts, press-box-pool.ts.<br />
          8. Regenerate baselines: moneypuck_baselines.json, team_baselines.json.<br />
          9. Check off each step in the checklist as you go.
        </div>
      </div>
    </div>
  );
}
