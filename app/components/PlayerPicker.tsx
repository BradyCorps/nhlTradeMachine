"use client";
// ── PlayerPicker — searchable single-select (ARIA combobox, list autocomplete) ──
// Replaces a several-hundred-option <select>. Typing filters through the shared
// player-search normaliser (accents, apostrophes, team names); arrow keys move,
// Enter picks, Escape closes. When the typed name matches nobody eligible it says
// why, using the excluded list, rather than showing an unexplained empty list.

import { useId, useMemo, useRef, useState } from "react";
import { matchesPlayerSearch } from "@/app/lib/player-search";
import type { ComparePeerOption, ExcludedPlayer } from "@/app/lib/strand-compare";

const MAX_SHOWN = 40;
const faint = "var(--ledger-ink-faint)";
const rule = "var(--ledger-rule)";

export default function PlayerPicker({ label, options, excluded = [], value, onChange, rule: ruleText }: {
  label: string;
  options: ComparePeerOption[];
  excluded?: ExcludedPlayer[];
  value: string;
  onChange: (id: string) => void;
  /** Eligibility rule, shown under the field. */
  rule?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find(o => o.id === value) ?? null;

  const matches = useMemo(
    () => options.filter(o => matchesPlayerSearch({ name: o.name, teamId: o.teamId ?? undefined }, query)),
    [options, query],
  );
  const shown = matches.slice(0, MAX_SHOWN);
  const blocked = useMemo(
    () => query.trim() && matches.length === 0
      ? excluded.filter(o => matchesPlayerSearch({ name: o.name, teamId: o.teamId ?? undefined }, query)).slice(0, 5)
      : [],
    [excluded, matches.length, query],
  );
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;

  const choose = (id: string) => { onChange(id); setQuery(""); setOpen(false); inputRef.current?.focus(); };
  const clamp = (i: number) => Math.max(0, Math.min(shown.length - 1, i));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => clamp(open ? a + 1 : a)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => clamp(a - 1)); }
    else if (e.key === "Home" && open) { e.preventDefault(); setActive(0); }
    else if (e.key === "End" && open) { e.preventDefault(); setActive(clamp(shown.length - 1)); }
    else if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); choose(shown[active].id); }
    else if (e.key === "Escape") { if (open) { e.preventDefault(); setOpen(false); } else if (query) setQuery(""); }
  };

  return (
    <div className="relative w-full" style={{ maxWidth: 320 }}>
      <label htmlFor={`${uid}-input`} className="block text-[9px] font-black font-mono uppercase tracking-[0.14em] mb-1" style={{ color: faint }}>
        {label}
      </label>
      <div className="flex gap-1">
        <input
          ref={inputRef}
          id={`${uid}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? optId(active) : undefined}
          aria-describedby={`${uid}-hint`}
          autoComplete="off"
          value={open ? query : (selected?.name ?? query)}
          placeholder={selected ? selected.name : "Search by name or team"}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 font-mono text-[12px] font-bold px-2 border rounded-none"
          style={{ minHeight: 44, background: "var(--paper-bg)", color: "var(--ledger-ink)", borderColor: rule }}
        />
        {selected && (
          <button type="button" onClick={() => { onChange(""); setQuery(""); inputRef.current?.focus(); }}
            aria-label={`Clear comparison with ${selected.name}`}
            className="font-mono text-[12px] font-black px-3 border"
            style={{ minHeight: 44, minWidth: 44, background: "var(--paper-bg)", color: "var(--ledger-red)", borderColor: rule }}>
            ✕
          </button>
        )}
      </div>
      <p id={`${uid}-hint`} className="mt-1 text-[9px] font-mono leading-relaxed" style={{ color: faint }}>
        {ruleText} {options.length} eligible.
      </p>
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} results`}
          className="absolute z-20 left-0 right-0 mt-0.5 border overflow-y-auto"
          style={{ maxHeight: 260, background: "var(--paper-bg)", borderColor: rule }}>
          {shown.map((o, i) => (
            <li key={o.id} id={optId(i)} role="option" aria-selected={o.id === value}
              onMouseDown={e => { e.preventDefault(); choose(o.id); }}
              onMouseEnter={() => setActive(i)}
              className="px-2 py-2 font-mono text-[12px] cursor-pointer flex justify-between gap-2"
              style={{ background: i === active ? "var(--ledger-cream)" : "transparent", color: "var(--ledger-ink)", minHeight: 36 }}>
              <span className="truncate font-bold">{o.name}</span>
              <span style={{ color: faint }}>{o.position}{o.teamId ? ` · ${o.teamId}` : ""}</span>
            </li>
          ))}
          {matches.length > MAX_SHOWN && (
            <li role="presentation" className="px-2 py-1 text-[9px] font-mono" style={{ color: faint }}>
              {matches.length - MAX_SHOWN} more — keep typing to narrow.
            </li>
          )}
          {matches.length === 0 && (
            <li role="presentation" className="px-2 py-2 text-[11px] font-mono leading-relaxed" style={{ color: "var(--ledger-ink-body, var(--ledger-ink))" }}>
              {blocked.length > 0
                ? blocked.map(b => <div key={b.id}><strong>{b.name}</strong> can&apos;t be compared: {b.reason}.</div>)
                : "No eligible player matches. Players in the other position group, or not in the baseline data, are not listed."}
            </li>
          )}
        </ul>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {open ? `${matches.length} eligible ${matches.length === 1 ? "player" : "players"}` : ""}
      </div>
    </div>
  );
}
