import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StrandDisplay from "../app/components/StrandDisplay";

describe("StrandDisplay accessibility", () => {
  it("names the SVG for its context and exposes the values behind the shape", () => {
    const html = renderToStaticMarkup(React.createElement(StrandDisplay, {
      ariaDescription: "Kyle Connor player profile STRAND",
      strandType: "OFFENSIVE FORCE",
      offTraits: [
        { label: "OPS", val: 0.82, idx: 82, raw: "6.4 OPS" },
        { label: "xG", val: 0.5, unavailable: true },
      ],
      defTraits: [
        { label: "SUPP", val: 0.64, idx: 64, raw: "+1.2 vs teammates" },
      ],
      compareOff: [{ label: "OPS", val: 0.71, idx: 71, raw: "5.1 OPS" }],
      compareDef: [{ label: "SUPP", val: 0.58, idx: 58, raw: "+0.5 vs teammates" }],
      compareLabel: "Ehlers",
    }));

    expect(html).toContain('role="img"');
    const accessibleName = html.match(/aria-label="([^"]+)"/)?.[1];
    expect(accessibleName).toContain("Kyle Connor player profile STRAND");
    expect(accessibleName).toContain("Type: OFFENSIVE FORCE");
    expect(accessibleName).toContain("OPS 82 out of 100, actual 6.4 OPS");
    expect(accessibleName).toContain("xG unavailable");
    expect(accessibleName).toContain("SUPP 64 out of 100, actual +1.2 vs teammates");
    expect(accessibleName).toContain("Comparison with Ehlers");
    expect(accessibleName).toContain("OPS 71 out of 100, actual 5.1 OPS");
    expect(accessibleName).toContain("SUPP 58 out of 100, actual +0.5 vs teammates");
  });
});
