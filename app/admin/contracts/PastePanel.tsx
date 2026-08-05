"use client";

// ── Paste a signings list, review it, write it ────────────────
//
// Contracts are hand-maintained now. Hand-maintained does not have to mean
// hand-typed: select the transactions page, copy, paste here. The parser lives
// in `puckpedia-paste.ts` and checks itself three ways, so this component's
// only real job is to show you what it made of the paste BEFORE anything is
// written, and to make the rows it is unsure about impossible to miss.
//
// Nothing is sent until you press the button. Rows can be unticked
// individually, so one bad record does not cost you the other twenty.
//
// THE NAME COLUMN
//
// The source and the system disagree about names — Egor/Yegor Chinakhov,
// Nick/Nicholas Paul, Sam/Samuel Montembeault. The ingest keys on the name, so
// an unreconciled row does not fail, it INSERTS a second copy of a player who
// is already there. `name-match.ts` resolves what it safely can and leaves the
// rest for you: every row shows the name it will actually be written under,
// and the ones it is unsure about will not write until you pick.

import { useMemo, useState } from "react";
import { adminErrorMessage, readAdminResponse } from "@/app/admin/admin-response";
import { parsePuckPediaPaste, toIngestPayload, type ParsedSigning } from "@/app/lib/puckpedia-paste";
import { resolvePastedNames, type NameCandidate, type NameResolution } from "@/app/lib/name-match";

const MONO = "'Courier Prime', 'Courier New', monospace";

/** The name a row will be written under, before the operator overrides it. */
function defaultTarget(pasted: string, r: NameResolution | undefined): string {
  if (!r || r.action === "none") return pasted;      // genuinely new — write as pasted
  if (r.action === "ambiguous") return "";           // needs a human; blocks the write
  return r.match?.name ?? pasted;                    // auto and confirm both pre-fill
}

const cell: React.CSSProperties = { padding: "4px 8px", fontSize: 11, whiteSpace: "nowrap" };
const head: React.CSSProperties = {
  ...cell, fontWeight: 900, letterSpacing: "0.08em", textAlign: "left",
  borderBottom: "1px solid var(--rule)", color: "var(--ledger-ink-faint)",
};

const PLACEHOLDER = `Paste a signings list here — one player or a hundred.

MTL
Maksymilian Szuber
D
Maksymilian Szuber
AGE23
CAP HIT$850,000
LENGTH1 yr
TOTAL$850,000
% OF CAP0.82%
TYPERFA
CLAUSE`;

export default function PastePanel({ onSaved, known = [] }: {
  onSaved?: () => void;
  /** Every name the system already holds, for reconciliation. */
  known?: NameCandidate[];
}) {
  const [text, setText] = useState("");
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parsePuckPediaPaste(text), [text]);
  const resolved = useMemo(
    () => resolvePastedNames(parsed.signings, known),
    [parsed.signings, known],
  );

  /** What each row will be written under: the operator's pick, else the default. */
  const targetFor = (s: ParsedSigning): string =>
    picked[s.name] ?? defaultTarget(s.name, resolved.get(s.name));

  const ticked = parsed.signings.filter(s => !dropped.has(s.name));
  // A row with no target is not refused quietly — it is simply not written, and
  // the count beside the button says how many are waiting on a decision.
  const kept = ticked.filter(s => targetFor(s));
  const undecided = ticked.length - kept.length;

  const toggle = (name: string) => {
    const next = new Set(dropped);
    next.has(name) ? next.delete(name) : next.add(name);
    setDropped(next);
  };

  const save = async () => {
    if (kept.length === 0) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const names = Object.fromEntries(kept.map(s => [s.name, targetFor(s)]));
      const res = await fetch("/api/admin/contracts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players: toIngestPayload(kept, names) }),
      });
      const data = await readAdminResponse<{
        added?: number; updated?: number;
        reconciledEntries?: string[]; ambiguousEntries?: string[];
      }>(res, "Save failed");
      // The endpoint reconciles spellings of its own accord too. Say so — a
      // silent reconciliation reads exactly like a duplicate from out here.
      const extra = [
        (data.reconciledEntries?.length ?? 0) > 0
          ? `${data.reconciledEntries!.length} matched to an existing spelling`
          : null,
        (data.ambiguousEntries?.length ?? 0) > 0
          ? `${data.ambiguousEntries!.length} skipped as ambiguous: ${data.ambiguousEntries!.join("; ")}`
          : null,
      ].filter(Boolean);
      setResult([`${data.added ?? 0} added · ${data.updated ?? 0} updated`, ...extra].join(" · "));
      setText("");
      setDropped(new Set());
      setPicked({});
      onSaved?.();
    } catch (e) {
      setError(adminErrorMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: "1px solid var(--rule)", background: "var(--paper-card)", margin: "0 24px 16px", fontFamily: MONO }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--rule)" }}>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.18em" }}>PASTE SIGNINGS</span>
        <span style={{ fontSize: 10, color: "var(--ledger-ink-faint)" }}>
          copy a transactions list and drop it in — reviewed before anything is written
        </span>
      </div>

      <div style={{ padding: "12px 14px" }}>
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setDropped(new Set()); setPicked({}); setResult(null); setError(null); }}
          placeholder={PLACEHOLDER}
          rows={text ? 6 : 10}
          spellCheck={false}
          style={{
            width: "100%", fontFamily: MONO, fontSize: 11, lineHeight: 1.5, padding: "8px 10px",
            background: "var(--paper)", border: "1px solid var(--rule)", color: "var(--ledger-ink)",
            resize: "vertical",
          }}
        />
      </div>

      {text.trim() && (
        <div style={{ borderTop: "1px solid var(--rule)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 14px", fontSize: 11 }}>
            <span style={{ fontWeight: 900 }}>
              {parsed.signings.length} read
              {parsed.needsReview && (
                <span style={{ color: "var(--ledger-amber)" }}>
                  {" "}· {parsed.signings.filter(s => s.warnings.length).length} to check
                </span>
              )}
              {dropped.size > 0 && (
                <span style={{ color: "var(--ledger-ink-faint)" }}> · {dropped.size} unticked</span>
              )}
            </span>
            {undecided > 0 && (
              <span style={{ color: "var(--ledger-red)" }}>
                {undecided} waiting on a name — pick one or untick
              </span>
            )}
            {parsed.skipped.length > 0 && (
              <span
                title={parsed.skipped.join("\n")}
                style={{ color: "var(--ledger-red)", cursor: "help" }}>
                {parsed.skipped.length} line{parsed.skipped.length === 1 ? "" : "s"} not understood — hover
              </span>
            )}
            <button
              onClick={() => void save()}
              disabled={saving || kept.length === 0}
              style={{
                marginLeft: "auto", fontSize: 11, fontWeight: 900, padding: "5px 14px", letterSpacing: "0.1em",
                background: kept.length === 0 ? "transparent" : "var(--ledger-ice)",
                border: "1px solid var(--ledger-ice)",
                color: kept.length === 0 ? "var(--ledger-ink-faint)" : "#fff",
                cursor: saving || kept.length === 0 ? "default" : "pointer",
              }}>
              {saving ? "WRITING…" : `WRITE ${kept.length}`}
            </button>
          </div>

          {(result || error) && (
            <div style={{
              padding: "6px 14px", fontSize: 11,
              color: error ? "var(--ledger-red)" : "var(--ledger-green)",
            }}>
              {error ?? result}
            </div>
          )}

          {parsed.signings.length > 0 && (
            <div style={{ maxHeight: 320, overflowY: "auto", borderTop: "1px solid var(--rule)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...head, width: 28 }} />
                    <th style={head}>Player</th>
                    <th style={head}>Written as</th>
                    <th style={head}>Tm</th>
                    <th style={head}>Pos</th>
                    <th style={{ ...head, textAlign: "right" }}>Age</th>
                    <th style={{ ...head, textAlign: "right" }}>Cap hit</th>
                    <th style={{ ...head, textAlign: "right" }}>Yrs</th>
                    <th style={head}>Type</th>
                    <th style={head}>Starts</th>
                    <th style={head}>Signed</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.signings.map((s: ParsedSigning) => {
                    const off = dropped.has(s.name);
                    const warn = s.warnings.length > 0;
                    const r = resolved.get(s.name);
                    const target = targetFor(s);
                    const undecidedRow = !off && !target;
                    // Only the options that are actually on the table: whatever
                    // matched, its runners-up, and "write it as pasted".
                    const options = [
                      ...(r?.match ? [r.match] : []),
                      ...(r?.alternatives ?? []),
                    ].map(m => ({ value: m.name, label: m.name, why: m.why }));
                    if (!options.some(o => o.value === s.name)) {
                      options.push({ value: s.name, label: `${s.name} — new player`, why: "adds a new row under the pasted spelling" });
                    }
                    return (
                      <tr key={s.name}
                        style={{
                          borderBottom: "1px solid var(--rule-light)",
                          opacity: off ? 0.35 : 1,
                          background: undecidedRow ? "rgba(184,48,32,0.08)"
                            : warn && !off ? "rgba(217,119,6,0.07)" : undefined,
                        }}
                        title={s.warnings.join("\n")}>
                        <td style={cell}>
                          <input type="checkbox" checked={!off} onChange={() => toggle(s.name)}
                            aria-label={`Include ${s.name}`} />
                        </td>
                        <td style={{ ...cell, fontWeight: 700 }}>
                          {s.name}
                          {warn && <span style={{ color: "var(--ledger-amber)" }}> ⚠</span>}
                        </td>
                        <td style={cell}>
                          {options.length === 1 && options[0].value === s.name ? (
                            <span style={{ color: "var(--ledger-ink-faint)" }}>new player</span>
                          ) : (
                            <select
                              value={target}
                              onChange={e => setPicked({ ...picked, [s.name]: e.target.value })}
                              aria-label={`Write ${s.name} as`}
                              title={r?.match?.why ?? ""}
                              style={{
                                fontFamily: MONO, fontSize: 11, padding: "2px 4px", maxWidth: 210,
                                background: "var(--paper)", color: "var(--ledger-ink)",
                                border: `1px solid ${undecidedRow ? "var(--ledger-red)"
                                  : r?.action === "confirm" ? "var(--ledger-amber)" : "var(--rule)"}`,
                              }}>
                              {!target && <option value="">— which one? —</option>}
                              {options.map(o => (
                                <option key={o.value} value={o.value} title={o.why}>{o.label}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td style={cell}>{s.team}</td>
                        <td style={cell}>
                          {s.position || <span style={{ color: "var(--ledger-ink-faint)" }}>{s.rawPosition || "—"}</span>}
                        </td>
                        <td style={{ ...cell, textAlign: "right" }}>{s.age ?? "—"}</td>
                        <td style={{ ...cell, textAlign: "right", fontWeight: 900 }}>
                          ${(s.capHit / 1e6).toFixed(3)}M
                        </td>
                        <td style={{ ...cell, textAlign: "right" }}>{s.years}</td>
                        <td style={cell}>{s.type || "—"}</td>
                        <td style={{ ...cell, color: "var(--ledger-ink-faint)" }}>{s.impliedSeason ?? "—"}</td>
                        <td style={{ ...cell, color: "var(--ledger-ink-faint)" }}>{s.signDate ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ padding: "6px 14px", fontSize: 9, color: "var(--ledger-ink-faint)", borderTop: "1px solid var(--rule)", lineHeight: 1.6 }}>
            A forward reads as <b>F</b> and is left blank — the roster already knows whether he is a centre or a winger, and
            overwriting that with a guess would be worse than leaving it. <b>Starts</b> is inferred from the percentage of cap:
            a figure taken against a later ceiling means the money begins in a later season. <b>Written as</b> is the name the
            row lands on: the source spells players differently from the system (Egor/Yegor, Nick/Nicholas), and writing a
            pasted spelling that the system does not hold creates a second copy of a player rather than updating him. Known
            spelling variants are matched for you; anything less certain is left red until you choose.
          </div>
        </div>
      )}
    </div>
  );
}
