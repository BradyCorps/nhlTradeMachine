#!/usr/bin/env node

import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(sourceDir, "..");
const assetsDir = join(kitRoot, "assets");
const svgDir = join(assetsDir, "svg");
const faviconDir = join(assetsDir, "favicon");
const qaDir = mkdtempSync(join(tmpdir(), "cc-brand-kit-qa-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function renderSvg(path, width = 64) {
  const output = join(
    qaDir,
    `${path.slice(kitRoot.length + 1).replaceAll("/", "-")}.png`,
  );
  execFileSync(
    "inkscape",
    [path, `--export-filename=${output}`, `--export-width=${width}`],
    {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(qaDir, "config"),
        XDG_CACHE_HOME: join(qaDir, "cache"),
        XDG_DATA_HOME: join(qaDir, "data"),
      },
      stdio: "ignore",
    },
  );
  assert(statSync(output).size > 0, `Empty render for ${path}`);
  return output;
}

function normalizedRmse(pathA, pathB) {
  const result = spawnSync("compare", ["-metric", "RMSE", pathA, pathB, "null:"], {
    encoding: "utf8",
  });
  const metric = `${result.stdout}${result.stderr}`.match(/\(([\d.]+)\)/);
  assert(metric, `Unable to read visual comparison metric for ${pathA}`);
  return Number(metric[1]);
}

const allFiles = walk(kitRoot);
for (const path of allFiles) {
  assert(statSync(path).size > 0, `Zero-byte file: ${path}`);
}

for (const path of allFiles.filter((file) => file.endsWith(".json"))) {
  JSON.parse(readFileSync(path, "utf8"));
}

const primaryPath = join(svgDir, "cap-and-crease-mark-primary.svg");
const primary = readFileSync(primaryPath, "utf8");
const exactGeometry = [
  'viewBox="0 0 405.39 405.39"',
  "34.45 136.99 34.45 273.41",
  'x="202.7" y="134.47" width="8.84" height="150.31"',
  "M215.7,280.99c35.82,0,64.86-31.95,64.86-71.36s-29.04-71.36-64.86-71.36v142.73Z",
  'cx="187.73" cy="245.61" r="9.06"',
  "381.93 136.99 381.93 273.41",
  "#79afc1",
  "data:image/jpeg;base64,",
];
for (const value of exactGeometry) {
  assert(primary.includes(value), `Primary SVG lost required V3 value: ${value}`);
}
assert(
  statSync(primaryPath).size < 500_000,
  "Optimized primary SVG is unexpectedly larger than 500 KB.",
);

assert(
  sha256(join(svgDir, "cap-and-crease-wordmark.svg")) ===
    "ace5ff9b685a76df43246d61227972dc54e807752022e619313b7729b76ae086",
  "Approved outlined wordmark changed.",
);
assert(
  sha256(join(svgDir, "cap-and-crease-ampersand.svg")) ===
    "52dadd1a56145f8241623b14bca736195bf3ffb4b9b14a8bad6268d21ce29f20",
  "Approved signature ampersand changed.",
);

for (const path of walk(svgDir).filter((file) => file.endsWith(".svg"))) {
  const contents = readFileSync(path, "utf8");
  assert(!contents.includes("<text"), `Production SVG contains live text: ${path}`);
  assert(
    !/xlink:href="https?:|href="https?:/.test(contents),
    `Production SVG contains an external asset: ${path}`,
  );
  renderSvg(path);
}
for (const path of walk(faviconDir).filter((file) => file.endsWith(".svg"))) {
  renderSvg(path);
}

const expectedPngs = {
  "assets/png/cap-and-crease-mark-primary-1024.png": "1024x1024",
  "assets/png/cap-and-crease-mark-small-16.png": "16x16",
  "assets/png/cap-and-crease-mark-small-24.png": "24x24",
  "assets/png/cap-and-crease-mark-small-32.png": "32x32",
  "assets/png/cap-and-crease-og-1200x630.png": "1200x630",
  "assets/png/cap-and-crease-social-avatar-1024.png": "1024x1024",
  "assets/favicon/apple-touch-icon.png": "180x180",
  "assets/favicon/icon-192.png": "192x192",
  "assets/favicon/icon-512.png": "512x512",
  "assets/favicon/icon-maskable-512.png": "512x512",
};
for (const [relativePath, expected] of Object.entries(expectedPngs)) {
  const dimensions = execFileSync(
    "identify",
    ["-format", "%wx%h", join(kitRoot, relativePath)],
    { encoding: "utf8" },
  );
  assert(
    dimensions === expected,
    `${relativePath} is ${dimensions}; expected ${expected}.`,
  );
}

const icoFrames = execFileSync(
  "identify",
  ["-format", "%wx%h\n", join(faviconDir, "favicon.ico")],
  { encoding: "utf8" },
)
  .trim()
  .split("\n");
assert(
  JSON.stringify(icoFrames) === JSON.stringify(["16x16", "32x32", "48x48"]),
  `Unexpected ICO frames: ${icoFrames.join(", ")}`,
);

const manifest = JSON.parse(
  readFileSync(join(faviconDir, "site.webmanifest"), "utf8"),
);
for (const icon of manifest.icons) {
  const localPath = join(kitRoot, icon.src.replace(/^\/brand\//, "assets/"));
  assert(statSync(localPath).size > 0, `Manifest icon is missing: ${icon.src}`);
}

const originalRender = renderSvg(
  join(sourceDir, "master", "cap-and-crease-brady-createdV3-original.svg"),
  1024,
);
const productionRender = renderSvg(primaryPath, 1024);
const visualRmse = normalizedRmse(originalRender, productionRender);
assert(
  visualRmse < 0.003,
  `Optimized primary differs too much from V3 master: ${visualRmse}`,
);

const originalAlpha = join(qaDir, "original-alpha.png");
const productionAlpha = join(qaDir, "production-alpha.png");
execFileSync("convert", [originalRender, "-alpha", "extract", originalAlpha]);
execFileSync("convert", [productionRender, "-alpha", "extract", productionAlpha]);
const alphaRmse = normalizedRmse(originalAlpha, productionAlpha);
assert(alphaRmse === 0, `Production geometry alpha differs: ${alphaRmse}`);

console.log(`Validated ${allFiles.length} files.`);
console.log(`V3 visual RMSE: ${visualRmse}`);
console.log(`V3 alpha/geometry RMSE: ${alphaRmse}`);
console.log("Approved wordmark and ampersand checksums are unchanged.");
