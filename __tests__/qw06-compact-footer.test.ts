import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Footer from "@/app/components/Footer";

describe("QW-06 compact global footer", () => {
  it("renders the four reference destinations as touch-sized links", () => {
    const html = renderToStaticMarkup(React.createElement(Footer));
    expect(html).toContain('aria-label="Footer"');
    expect(html).toContain('href="/methodology"');
    expect(html).toContain('href="/glossary"');
    expect(html).toContain('href="/glossary#data-sources"');
    expect(html).toContain('href="/legal"');
    expect(html).toContain("min-h-11");
  });

  it("ends the product page before long glossary content begins", () => {
    const html = renderToStaticMarkup(React.createElement(Footer));
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Asset Flags");
    expect(html).not.toContain("Extended Net Asset Value:");
  });

  it("keeps full definitions on anchored dedicated pages", () => {
    const glossary = readFileSync("app/glossary/page.tsx", "utf8");
    const methodology = readFileSync("app/methodology/page.tsx", "utf8");
    expect(glossary).toContain('id="icon-key"');
    expect(glossary).toContain('id={slugify(`${section.title}-${term}`)}');
    expect(glossary).toContain('id={slugify(`icon-${label}`)}');
    expect(glossary).toContain("methodologySections.map");
    expect(methodology).toContain("SECTIONS.map");
  });
});
