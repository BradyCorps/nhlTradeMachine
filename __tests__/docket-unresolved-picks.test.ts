import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { docketTodayState } from "@/app/lib/docket-view";

describe("Docket today state for traded picks", () => {
  it("keeps a real NAV when one exists", () => {
    expect(docketTodayState({ position: "Pick", year: 2027 }, 38.5)).toEqual({ kind: "nav", value: 38.5 });
    expect(docketTodayState({ position: "C" }, 12)).toEqual({ kind: "nav", value: 12 });
  });

  it("says a pick from a completed draft was used, and does not guess its selection", () => {
    const state = docketTodayState({ position: "Pick", year: 2026, kind: "pick" } as never, null);
    expect(state.kind).toBe("pick-used");
    if (state.kind !== "pick-used") return;
    expect(state.label).toBe("Used at 2026 draft");
    expect(state.detail).toMatch(/not linked/);
    // No NAV and no player name is invented for it.
    expect(JSON.stringify(state)).not.toMatch(/Piiparinen|Pugachyov|\d+\.\d/);
  });

  it("keeps a future or unused pick explicitly pending", () => {
    const state = docketTodayState({ position: "Pick", year: 2027 }, null);
    expect(state.kind).toBe("pick-pending");
    if (state.kind === "pick-pending") expect(state.label).toBe("Pending");
  });

  it("leaves non-pick gaps as NA", () => {
    expect(docketTodayState({ position: "D" }, null)).toEqual({ kind: "unavailable", label: "NA" });
  });

  it("renders the state in place of the bare NA and leaves the frozen at-trade NAV alone", () => {
    const client = readFileSync("app/docket/DocketClient.tsx", "utf8");
    expect(client).toContain('today.kind === "nav" ? fmtNav(today.value) : today.label');
    expect(client).toContain("`TODAY: ${today.label.toUpperCase()}`");
    expect(client).toContain("{fmtNav(asset.navAtTrade ?? 0)} AT TRADE");
    expect(client).not.toContain('asset.navToday == null ? "TODAY NA"');
  });
});
