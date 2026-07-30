// ── Derived brand assets ─────────────────────────────────────────
//
// The V3 kit does not ship two files the app needs, and both are DERIVED from
// kit artwork rather than drawn — geometry is never touched, so a kit revision
// flows through by re-running this.
//
//   wordmark-cream           the hero nameplate sits on the dark desk, and the
//                            kit ships only the ink wordmark
//   lockup-horizontal-clean  the kit's lockup is 246 KB, 218 KB of which is a
//                            base64 paper-grain JPEG. At header size that grain
//                            is invisible, and the whole shared JS bundle is
//                            87 KB. This strips the texture layer and nothing
//                            else.
//
// Run: node scripts/derive-brand-assets.mjs

import fs from "node:fs";
import path from "node:path";

const KIT = "docs/cap-and-crease-brand-kitV3/assets/svg";
const OUT = "public/brand/svg";

const read = (f) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
const write = (f, s) => {
  fs.writeFileSync(path.join(process.cwd(), f), s);
  const kb = (Buffer.byteLength(s) / 1024).toFixed(1);
  console.log(`  ${f}  ${kb} KB`);
};

console.log("Deriving brand assets from the V3 kit:");

// ── Cream wordmark ───────────────────────────────────────────────
// The kit wordmark is ink (#1c140a) with a red ampersand. On the dark desk the
// ink disappears; the ampersand stays red so it does not wash out.
const wordmark = read(`${KIT}/cap-and-crease-wordmark.svg`);
const cream = wordmark
  .replace(/fill:#1c140a/g, "fill:#f2ecd7")
  .replace("Cap &amp; Crease wordmark", "Cap &amp; Crease wordmark, cream");
if (cream === wordmark) throw new Error("cream wordmark: nothing was substituted");
if (!cream.includes('fill="#b83020"')) throw new Error("cream wordmark: lost the red ampersand");
write(`${OUT}/cap-and-crease-wordmark-cream.svg`, cream);

// ── Untextured lockup ────────────────────────────────────────────
// One masked <image> carries the grain. Removing it leaves the vector artwork
// byte-identical; the mask definition is left in place so the file stays a
// minimal diff against the kit's.
const lockup = read(`${KIT}/cap-and-crease-lockup-horizontal.svg`);
const clean = lockup.replace(/\s*<image\b[^>]*\/>/g, "");
if (clean === lockup) throw new Error("clean lockup: no <image> layer found to strip");
if (/base64/.test(clean)) throw new Error("clean lockup: base64 payload survived");
// Every drawn element must survive — this strips a texture, not artwork.
for (const tag of ["path", "polygon", "rect", "circle"]) {
  const before = (lockup.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length;
  const after = (clean.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length;
  if (before !== after) throw new Error(`clean lockup: lost ${before - after} <${tag}> elements`);
}
write(`${OUT}/cap-and-crease-lockup-horizontal-clean.svg`, clean);

console.log("Done.");
