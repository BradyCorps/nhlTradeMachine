"use client";

import { useId, useState, type ReactNode } from "react";

/** A visible entry point and removable selections, with sorting kept separate. */
export function CompactFilters({ count, chips, children }: {
  count: string;
  chips: { label: string; clear: () => void }[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="compact-filters">
    <div className="compact-filter-summary">
      <button type="button" className="tap-target filter-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>Filter{chips.length ? ` (${chips.length})` : ""}</button>
      <span role="status">{count}</span>
      {chips.map(chip => <button type="button" className="tap-target filter-btn" key={chip.label} onClick={chip.clear} aria-label={`Remove ${chip.label} filter`}>{chip.label} ×</button>)}
    </div>
    <div id={id} className="compact-filter-options" hidden={!open}>{children}</div>
  </div>;
}
