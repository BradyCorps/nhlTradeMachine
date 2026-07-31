import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./support/source";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(process.cwd(), p));

const KIT = "docs/cap-and-crease-brand-kitV3";
const PUBLIC = "public/brand";

/** Every `d="..."` in an SVG, in document order. */
const pathData = (svg: string): string[] =>
  [...svg.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);

/** V3 draws the brackets as polygons, so geometry is not all in `d`. */
const polygonPoints = (svg: string): string[] =>
  [...svg.matchAll(/\spoints="([^"]+)"/g)].map(m => m[1]);

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

  // Against the CLEAN cut: it is the geometry the component renders, and it is
  // identical to the textured primary minus the grain overlay.
  it("inlines every path from the primary cut", () => {
    const clean = read(`${PUBLIC}/svg/cap-and-crease-mark-primary-clean.svg`);
    for (const d of pathData(clean)) {
      expect(component, d.slice(0, 32)).toContain(d);
    }
  });

  it("inlines both bracket polygons", () => {
    const clean = read(`${PUBLIC}/svg/cap-and-crease-mark-primary-clean.svg`);
    const points = polygonPoints(clean);
    expect(points).toHaveLength(2);
    for (const p of points) expect(component, p.slice(0, 32)).toContain(p);
  });

  it("inlines every path from the small cut", () => {
    for (const d of pathData(read(`${PUBLIC}/svg/cap-and-crease-mark-small.svg`))) {
      expect(component, d.slice(0, 32)).toContain(d);
    }
  });

  it("carries the kit's colours and no invented ones", () => {
    const hexes = new Set((component.match(/#[0-9a-fA-F]{6}/g) ?? []).map(h => h.toLowerCase()));
    expect(hexes).toEqual(new Set(["#1c140a", "#f2ecd7", "#b83020", "#79afc1"]));
  });

  // "The blue crease always points right." The goal line sits at x=202.7 and
  // the crease starts at x=215.7, so crease-right is structural, not styling.
  it("keeps the approved orientation", () => {
    expect(component).toContain('x: 202.7');
    expect(component).toContain("M215.7,280.99");
    expect(component).not.toContain("rotate(");
  });

  // The gap between the red goal and the red goal line is deliberate: the goal
  // path ends at x=196.38 and the line begins at 202.7.
  it("keeps the goal separated from the goal line", () => {
    expect(component).toContain("M196.38,149.6");
    expect(component).toContain('x: 202.7');
  });

  // V3 INVERTED what the small cut drops. It keeps the puck and omits the
  // brackets; V2 did the opposite. Asserting the old rule would now be
  // asserting the wrong mark.
  it("keeps the puck in the small cut and drops the brackets", () => {
    const small = read(`${PUBLIC}/svg/cap-and-crease-mark-small.svg`);
    expect(small).toContain("<circle");
    expect(polygonPoints(small)).toHaveLength(0);
    const clean = read(`${PUBLIC}/svg/cap-and-crease-mark-primary-clean.svg`);
    expect(polygonPoints(clean)).toHaveLength(2);
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

// Every colour in the palette should have a job. Gold and violet had one call
// site each, no semantic role, and no relationship to the identity — gold was
// a near-duplicate of amber (#946914 vs #8a5c00), violet was a lone accent on
// a bar whose positive/negative pairing is green/amber everywhere else.
describe("palette has no orphan accents", () => {
  it("retired gold and violet from the tokens and the Tailwind palette", () => {
    for (const f of ["app/globals.css", "tailwind.config.ts"]) {
      const src = read(f);
      expect(src, f).not.toContain("ledger-gold");
      expect(src, f).not.toContain("ledger-violet");
      expect(src, f).not.toContain("#5b4a9b");
    }
  });

  it("leaves no component referencing a retired token", () => {
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) out.push(...walk(rel));
        else if (/\.tsx?$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    const offenders = walk("app").filter(f => /ledger-(gold|violet)/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("keeps every MicroBar key mapped to a real colour", () => {
    const src = read("app/components/MicroBar.tsx");
    const keys = [...src.matchAll(/^\s+(\w+):\s+"var\(--([\w-]+)\)"/gm)].map(m => m[2]);
    expect(keys.length).toBeGreaterThan(0);
    const css = read("app/globals.css");
    for (const token of keys) expect(css, token).toContain(`--${token}:`);
  });
});

// The ice rotation was done by token name, so a second navy under a different
// name (--blue, 31 usages) survived the first pass. Both are on the brand hue
// now; this is the guard that a third one cannot appear unnoticed.
describe("no cold navy survives anywhere in the palette", () => {
  it("keeps every blue token on the ice hue", () => {
    const css = read("app/globals.css");
    const blues = [...css.matchAll(/--(?:ledger-ice|blue):\s+(#[0-9a-f]{6})/g)].map(m => m[1]);
    expect(blues.length).toBe(2);
    for (const hex of blues) {
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      // Cyan-leaning: green close under blue. A 220° navy fails this.
      expect(b - g, hex).toBeLessThan(24);
      expect(b, hex).toBeGreaterThan(g);
    }
  });

  it("retires the old navy hexes entirely", () => {
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) out.push(...walk(rel));
        else if (/\.(tsx?|css)$/.test(e.name)) out.push(rel);
      }
      return out;
    };
    const offenders = walk("app").filter(f => {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      return /#1a2e5c|#2b3f66/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("gives the two token families one amber, not two", () => {
    const css = read("app/globals.css");
    expect(css).toContain("--ledger-amber:        #8a5c00");
    expect(css).toContain("--amber:        #8a5c00");
  });
});

// ── Texture stays off the critical path ──────────────────────────
//
// The V3 textured artwork embeds a 1024×1024 paper-grain JPEG as base64: the
// primary mark is 221 KB and the header lockup 246 KB, against a shared JS
// bundle of 87 KB. At the sizes the UI actually renders (44px marks, a header
// lockup) that grain is downsampled past visibility, so the app uses the clean
// cuts and the textured files stay for large display and exports.
describe("brand assets on the critical path", () => {
  const bytes = (p: string) => fs.statSync(path.join(process.cwd(), p)).size;

  it("the header lockup carries no embedded raster", () => {
    const clean = read(`${PUBLIC}/svg/cap-and-crease-lockup-horizontal-clean.svg`);
    expect(clean).not.toContain("base64");
    expect(clean).not.toContain("<image");
  });

  it("the clean lockup keeps every drawn element of the kit's", () => {
    // It strips a texture layer, not artwork.
    const kit = read(`${KIT}/assets/svg/cap-and-crease-lockup-horizontal.svg`);
    const clean = read(`${PUBLIC}/svg/cap-and-crease-lockup-horizontal-clean.svg`);
    expect(pathData(clean)).toEqual(pathData(kit));
    expect(polygonPoints(clean)).toEqual(polygonPoints(kit));
  });

  it("the header lockup is a fraction of the textured one", () => {
    const clean = bytes(`${PUBLIC}/svg/cap-and-crease-lockup-horizontal-clean.svg`);
    const textured = bytes(`${PUBLIC}/svg/cap-and-crease-lockup-horizontal.svg`);
    expect(clean).toBeLessThan(textured / 5);
    expect(clean).toBeLessThan(60_000);
  });

  it("the header does not reference the textured lockup", () => {
    const header = read("app/components/Header.tsx");
    expect(header).toContain("cap-and-crease-lockup-horizontal-clean.svg");
    expect(header).not.toMatch(/lockup-horizontal\.svg/);
  });

  it("the inlined component carries no base64 payload", () => {
    // Comments stripped: the component's own note explains why it avoids the
    // base64 texture, and naming the thing you avoid is not shipping it.
    expect(stripComments(read("app/components/BrandMark.tsx"))).not.toContain("base64");
  });

  // The textured artwork is still shipped — this is a routing decision about
  // the critical path, not a deletion of the user's grain.
  it("still publishes the textured artwork for large use and export", () => {
    for (const f of [
      "svg/cap-and-crease-mark-primary.svg",
      "svg/cap-and-crease-lockup-horizontal.svg",
      "png/cap-and-crease-og-1200x630.png",
    ]) {
      expect(exists(`${PUBLIC}/${f}`), f).toBe(true);
    }
    expect(read(`${PUBLIC}/svg/cap-and-crease-mark-primary.svg`)).toContain("base64");
  });
});
