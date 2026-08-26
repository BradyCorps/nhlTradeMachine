import type { LeagueProvenance, ProductRoute } from "@/app/lib/data-context";
import { routeDataContext } from "@/app/lib/data-context";

export function DataContextRail({
  route,
  provenance,
  capCeiling,
}: {
  route: ProductRoute;
  provenance: LeagueProvenance | null | undefined;
  capCeiling?: number | null;
}) {
  const context = routeDataContext(route, provenance, { capCeiling });

  return (
    <section
      aria-label="Data context"
      className="border px-3 py-2 font-mono"
      style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
    >
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] leading-relaxed" style={{ color: "var(--ledger-ink-faint)" }}>
        {context.items.map(item => (
          <div key={item.label} className="flex gap-1">
            <dt className="font-black uppercase tracking-[0.08em]">{item.label}:</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      {context.warning && (
        <p role="status" className="mt-1 text-[10px] font-black" style={{ color: "var(--ledger-red)" }}>
          Data warning: {context.warning}
        </p>
      )}
    </section>
  );
}
