import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HelpPopover } from "@/app/components/HelpPopover";

describe("QW-04 accessible help controls", () => {
  it("renders a real, labelled, mobile-sized disclosure control", () => {
    const html = renderToStaticMarkup(React.createElement(HelpPopover, {
      label: "VOR",
      definition: "Value Over Replacement",
    }, "VOR"));

    expect(html).toContain("<button");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls=");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("min-w-11");
  });

  it("uses the shared focus-managed popover/sheet behavior", () => {
    const source = readFileSync("app/components/HelpPopover.tsx", "utf8");
    expect(source).toContain("useDialog");
    expect(source).toContain("createPortal");
    expect(source).toContain("onPointerDown");
    expect(source).toContain('aria-label={`Close ${label} definition`}');
  });

  it("adopts real help controls on every requested product surface", () => {
    const sources = [
      "app/players/page.tsx",
      "app/teams/page.tsx",
      "app/fantasy/page.tsx",
      "app/components/QuickTradeMachine.tsx",
      "app/armchair-gm/GmAnalysisTabs.tsx",
      "app/armchair-gm/RosterTab.tsx",
    ].map(file => readFileSync(file, "utf8"));

    for (const source of sources) expect(source).toMatch(/HelpPopover|MetricTip/);
  });
});
