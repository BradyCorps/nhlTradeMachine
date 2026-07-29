import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(process.cwd(), p));

const KIT = "docs/cap-and-crease-brand-kit";
const PUBLIC = "public/brand";

/** Every `d="..."` in an SVG, in document order. */
const pathData = (svg: string): string[] =>
  [...svg.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);

describe("brand kit is published to public/", () => {
  it("ships the files the metadata and manifest point at", () => {
    for (const file of [
      "favicon/favicon.svg",
      "favicon/favicon-16.png",
      "favicon/favicon-32.png",
      "favicon/apple-touch-icon.png",
      "favicon/safari-pinned-tab.svg",
      "favicon/site.webmanifest",
      "favicon/icon-192.png",
      "favicon/icon-512.png",
      "favicon/icon-maskable-512.png",
      "png/cap-and-crease-og-1200x630.png",
      "svg/cap-and-crease-lockup-horizontal.svg",
      "svg/cap-and-crease-wordmark.svg",
    ]) {
      expect(exists(`${PUBLIC}/${file}`), file).toBe(true);
    }
  });

  it("keeps the published copies identical to the kit", () => {
    for (const file of [
      "svg/cap-and-crease-mark-primary.svg",
      "svg/cap-and-crease-mark-small.svg",
      "svg/cap-and-crease-lockup-horizontal.svg",
      "favicon/site.webmanifest",
    ]) {
      expect(read(`${PUBLIC}/${file}`), file).toBe(read(`${KIT}/assets/${file}`));
    }
  });
});

// The component inlines the kit's geometry rather than fetching the SVGs, so
// this is the guard that a kit revision cannot leave the app rendering a
// superseded mark. It compares against the published SVG, not a copy.
describe("BrandMark matches the kit geometry", () => {
  const component = read("app/components/BrandMark.tsx");

  it("inlines every path from the primary cut", () => {
    for (const d of pathData(read(`${PUBLIC}/svg/cap-and-crease-mark-primary.svg`))) {
      expect(component, d.slice(0, 32)).toContain(d);
    }
  });

  it("inlines every path from the small cut", () => {
    for (const d of pathData(read(`${PUBLIC}/svg/cap-and-crease-mark-small.svg`))) {
      expect(component, d.slice(0, 32)).toContain(d);
    }
  });

  it("carries the kit's five colours and no invented ones", () => {
    const hexes = new Set((component.match(/#[0-9a-fA-F]{6}/g) ?? []).map(h => h.toLowerCase()));
    expect(hexes).toEqual(new Set(["#1c140a", "#f2ecd7", "#b83020", "#79afc1"]));
  });

  // "Do not rotate the mark; the red goal is left of the vertical line and the
  // blue crease always projects right." The goal line sits at x=130 and the
  // crease starts at x=140, so crease-right is structural, not styling.
  it("keeps the approved orientation", () => {
    const primary = read(`${PUBLIC}/svg/cap-and-crease-mark-primary.svg`);
    expect(primary).toContain("M130 62h10v134h-10z");
    expect(primary).toContain("M140 70a58 58 0 0 1 0 116V70Z");
    expect(component).not.toContain("rotate(");
  });

  it("omits the puck from the small cut, as the kit specifies", () => {
    const small = read(`${PUBLIC}/svg/cap-and-crease-mark-small.svg`);
    expect(small).not.toContain("<circle");
    expect(read(`${PUBLIC}/svg/cap-and-crease-mark-primary.svg`)).toContain("<circle");
  });
});

describe("brand tokens", () => {
  it("defines all five kit tokens", () => {
    const css = read("app/globals.css");
    for (const token of ["--cc-ink", "--cc-paper", "--cc-red", "--cc-brass", "--cc-ice-blue"]) {
      expect(css, token).toContain(token);
    }
  });

  // Four of the five already existed under ledger names. Aliasing rather than
  // duplicating means a kit revision changes one value, not two that can drift.
  it("aliases the four that already existed rather than restating the hex", () => {
    const css = read("app/globals.css");
    expect(css).toContain("--cc-ink:       var(--ledger-ink)");
    expect(css).toContain("--cc-red:       var(--ledger-red)");
    expect(css).toContain("--cc-brass:     var(--ledger-rule)");
  });

  it("agrees with the kit's own token file", () => {
    const kit = read(`${KIT}/assets/brand-tokens.css`);
    expect(kit).toContain("--cc-ice-blue: #79afc1");
    expect(read("app/globals.css")).toContain("--cc-ice-blue:  #79afc1");
  });
});

// The kit ships no cream wordmark, and the hero nameplate sits on the dark
// desk. The cream cut is derived from the kit file by swapping the two group
// fills — so it must stay path-identical, or a kit revision would leave the
// hero on a superseded wordmark while the sheet below it updated.
describe("derived cream wordmark", () => {
  const kit = read(`${PUBLIC}/svg/cap-and-crease-wordmark.svg`);
  const cream = read(`${PUBLIC}/svg/cap-and-crease-wordmark-cream.svg`);

  it("has identical geometry to the kit wordmark", () => {
    expect(pathData(cream)).toEqual(pathData(kit));
  });

  it("differs from it only in the ink fill and its title", () => {
    const normalise = (svg: string) =>
      svg.replace(/fill:#f2ecd7/g, "fill:#1c140a")
         .replace("Cap &amp; Crease wordmark, cream", "Cap &amp; Crease wordmark");
    expect(normalise(cream)).toBe(normalise(kit));
  });

  it("keeps the ampersand red rather than washing it out", () => {
    expect(cream).toContain('fill="#b83020"');
  });
});

// ── Ice blue ramp ────────────────────────────────────────────────
// The kit's ice blue is a FILL. Using it as text would be 2.04:1 on paper,
// well under WCAG AA's 4.5:1, which is why the deep step exists and why the
// kit says the colour is "reserved for the crease and related data accents".
const luminance = (hex: string): number => {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("ice blue ramp", () => {
  const PAPER = "#f2ecd7";
  const CARD = "#e4d8b8";
  const KIT_ICE = "#79afc1";
  const DEEP_ICE = "#1a4b5b";

  it("keeps the deep step readable on both paper surfaces", () => {
    expect(contrast(DEEP_ICE, PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(DEEP_ICE, CARD)).toBeGreaterThanOrEqual(4.5);
  });

  // The whole reason the ramp has two steps.
  it("confirms the kit value cannot carry text", () => {
    expect(contrast(KIT_ICE, PAPER)).toBeLessThan(4.5);
  });

  it("puts the deep step on the kit's hue, not the old navy's", () => {
    // Blue-channel dominance alone is not enough — the old navy was #1a2e5c.
    // Green must sit close to blue for the cyan-leaning ice hue.
    const g = parseInt(DEEP_ICE.slice(3, 5), 16);
    const b = parseInt(DEEP_ICE.slice(5, 7), 16);
    expect(b - g).toBeLessThan(24);
    expect(b).toBeGreaterThan(g);
  });

  it("wires the ramp into the token file and the Tailwind palette", () => {
    expect(read("app/globals.css")).toContain("--ledger-ice:          #1a4b5b");
    expect(read("tailwind.config.ts")).toContain("ice:          '#1a4b5b'");
  });

  it("leaves no reference to the retired navy token", () => {
    for (const f of ["app/globals.css", "tailwind.config.ts"]) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, f).not.toContain("ledger-navy");
      expect(src, f).not.toContain("#1a2e5c");
    }
  });
});
