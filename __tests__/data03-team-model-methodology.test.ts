import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const methodology = readFileSync(`${process.cwd()}/app/methodology/page.tsx`, "utf8");

// DATA-03: "A Team Model Card publishes inputs, thresholds, weights,
// validation, and examples." Every claim below is asserted against text that
// names a real, already-shipped mechanism (team-window.ts, team-cap-space.ts,
// roster-legality.ts, team-nav-split.ts, expiry-ledger.ts) rather than new
// unvalidated prose.
describe("DATA-03: Team Model methodology section", () => {
  it("is present and reachable by its own anchor", () => {
    expect(methodology).toContain('id: "team-model"');
    expect(methodology).toContain("The Team Model");
  });

  it("names phase and competitive window as distinct, separately sourced fields", () => {
    expect(methodology).toContain("Phase is the standings tier");
    expect(methodology).toContain("Competitive window is a read of the CURRENT roster's valuations");
  });

  it("publishes the cap-space reference ceiling and rebasing rule", () => {
    expect(methodology).toContain("$95.5M reference ceiling");
    expect(methodology).toContain("ceiling delta");
  });

  it("publishes the lineup-legality minimums", () => {
    expect(methodology).toContain("12 forwards, 6 defensemen, 2 goaltenders");
  });

  it("states the F/D/G-NAV population, and that the per-player values summed are genuinely position-specific models post NAV-02/NAV-03", () => {
    expect(methodology).toContain("client-side positional SUM");
    expect(methodology).toContain("signed active roster only");
    expect(methodology).toContain("genuinely position-specific");
  });

  it("describes the expiry ledger naming the league year rather than a single expiring bucket", () => {
    expect(methodology).toContain("calendar year a player's rights actually reach the market");
  });
});
