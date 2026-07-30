#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(sourceDir, "..");
const svgDir = join(kitRoot, "assets", "svg");
const faviconDir = join(kitRoot, "assets", "favicon");
const masterDir = join(sourceDir, "master");
const textureDir = join(sourceDir, "texture");
const templateDir = join(sourceDir, "templates-v1.1");
const masterPath = join(
  masterDir,
  "cap-and-crease-brady-createdV3-original.svg",
);

const incomingMaster = process.argv[2] ? resolve(process.argv[2]) : null;

mkdirSync(svgDir, { recursive: true });
mkdirSync(faviconDir, { recursive: true });
mkdirSync(masterDir, { recursive: true });
mkdirSync(textureDir, { recursive: true });
mkdirSync(templateDir, { recursive: true });

if (incomingMaster) {
  copyFileSync(incomingMaster, masterPath);
}

if (!existsSync(masterPath)) {
  throw new Error(
    `Missing V3 master at ${masterPath}. Pass the original SVG path as the first argument.`,
  );
}

const templateFiles = [
  ["lockup-horizontal.svg", join(svgDir, "cap-and-crease-lockup-horizontal.svg")],
  ["lockup-stacked.svg", join(svgDir, "cap-and-crease-lockup-stacked.svg")],
  ["social-card.svg", join(svgDir, "cap-and-crease-social-card.svg")],
  ["seal.svg", join(svgDir, "cap-and-crease-seal.svg")],
  ["lockup-horizontal-live.svg", join(sourceDir, "lockup-horizontal-live.svg")],
  ["lockup-stacked-live.svg", join(sourceDir, "lockup-stacked-live.svg")],
  ["social-card-live.svg", join(sourceDir, "social-card-live.svg")],
  ["seal-live.svg", join(sourceDir, "seal-live.svg")],
];

for (const [templateName, currentPath] of templateFiles) {
  const templatePath = join(templateDir, templateName);
  if (!existsSync(templatePath) && existsSync(currentPath)) {
    copyFileSync(currentPath, templatePath);
  }
}

const masterSvg = readFileSync(masterPath, "utf8");
const jpegMatch = masterSvg.match(
  /xlink:href="data:image\/jpeg;base64,([^"]+)"/,
);

if (!jpegMatch) {
  throw new Error("The V3 master does not contain its embedded paper texture.");
}

const textureOriginal = join(textureDir, "paper-texture-original.tmp.jpg");
const textureOptimized = join(textureDir, "paper-texture-1024.jpg");
writeFileSync(textureOriginal, Buffer.from(jpegMatch[1], "base64"));

execFileSync(
  "convert",
  [
    textureOriginal,
    "-auto-orient",
    "-resize",
    "1024x1024!",
    "-strip",
    "-colorspace",
    "sRGB",
    "-sampling-factor",
    "4:2:0",
    "-quality",
    "85",
    textureOptimized,
  ],
  { stdio: "inherit" },
);
rmSync(textureOriginal);

const textureBase64 = readFileSync(textureOptimized).toString("base64");
const textureHref = `data:image/jpeg;base64,${textureBase64}`;

const VIEWBOX = 405.39;
const INK = "#1c140a";
const RED = "#b83020";
const BLUE = "#79afc1";
const PAPER = "#f2ecd7";

const leftBracket =
  "107.71 139.52 107.71 116.78 54.66 116.78 34.45 136.99 34.45 273.41 54.66 293.62 112.77 293.62 112.77 270.88 76.14 270.88 67.29 262.04 67.29 148.36 76.14 139.52 107.71 139.52";
const goal =
  "M196.38,149.6v10.22h-43.84c-1.1,0-2.2.19-3.2.64-1.5.68-3.19,2.06-3.26,4.84-.11,4.51-.02,75.27,0,90.73,0,3.93,3.07,7.22,6.99,7.37.06,0,.11,0,.17,0,5.78.13,43.12,0,43.12,0v10.13h-43.61s-17.01-.74-16.93-15.81c.09-15.07,0-92.18,0-92.18,0,0-.33-15.95,14.83-15.94,15.16,0,45.72,0,45.72,0Z";
const crease =
  "M215.7,280.99c35.82,0,64.86-31.95,64.86-71.36s-29.04-71.36-64.86-71.36v142.73Z";
const rightBracket =
  "308.67 139.52 308.67 116.78 361.72 116.78 381.93 136.99 381.93 273.41 361.72 293.62 303.62 293.62 303.62 270.88 340.25 270.88 349.09 262.04 349.09 148.36 340.25 139.52 308.67 139.52";

function shapeMarkup({
  ink = INK,
  red = RED,
  blue = BLUE,
  puck = true,
  brackets = true,
} = {}) {
  return [
    brackets ? `<polygon fill="${ink}" points="${leftBracket}"/>` : "",
    `<path fill="${red}" d="${goal}"/>`,
    `<rect fill="${red}" x="202.7" y="134.47" width="8.84" height="150.31"/>`,
    `<path fill="${blue}" d="${crease}"/>`,
    puck
      ? `<circle fill="${ink}" cx="187.73" cy="245.61" r="9.06"/>`
      : "",
    brackets ? `<polygon fill="${ink}" points="${rightBracket}"/>` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function texturedMarkup({ id, puck = true } = {}) {
  const maskId = `paper-mask-${id}`;
  return `<defs>
  <mask id="${maskId}" x="0" y="0" width="${VIEWBOX}" height="${VIEWBOX}" maskUnits="userSpaceOnUse">
    <g opacity=".67">
      ${shapeMarkup({ puck })}
    </g>
  </mask>
</defs>
${shapeMarkup({ puck })}
<image x="0" y="0" width="420" height="420" preserveAspectRatio="none" xlink:href="${textureHref}" mask="url(#${maskId})"/>`;
}

function markSvg({
  title,
  description,
  ink = INK,
  red = RED,
  blue = BLUE,
  puck = true,
  brackets = true,
  texture = false,
  id = "mark",
  viewBox = `0 0 ${VIEWBOX} ${VIEWBOX}`,
} = {}) {
  const artwork = texture
    ? texturedMarkup({ id, puck })
    : shapeMarkup({ ink, red, blue, puck, brackets });
  const escapedTitle = title.replaceAll("&", "&amp;");
  const escapedDescription = description.replaceAll("&", "&amp;");

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}" role="img" aria-labelledby="${id}-title ${id}-desc">
  <title id="${id}-title">${escapedTitle}</title>
  <desc id="${id}-desc">${escapedDescription}</desc>
  ${artwork}
</svg>
`;
}

writeFileSync(
  join(svgDir, "cap-and-crease-mark-primary.svg"),
  markSvg({
    title: "Cap & Crease V3 primary mark",
    description:
      "A textured top-down hockey goal with the puck in the net and a right-facing ice-blue crease, framed by widely spaced editorial brackets.",
    texture: true,
    id: "primary",
  }),
);

writeFileSync(
  join(svgDir, "cap-and-crease-mark-primary-clean.svg"),
  markSvg({
    title: "Cap & Crease V3 clean mark",
    description:
      "The V3 primary mark without paper grain for small or performance-sensitive use.",
    id: "clean",
  }),
);

writeFileSync(
  join(svgDir, "cap-and-crease-mark-primary-no-puck.svg"),
  markSvg({
    title: "Cap & Crease V3 mark without puck",
    description:
      "The textured V3 mark with the puck omitted for reduced-size use.",
    texture: true,
    puck: false,
    id: "no-puck",
  }),
);

writeFileSync(
  join(svgDir, "cap-and-crease-mark-small.svg"),
  markSvg({
    title: "Cap & Crease V3 optical small mark",
    description:
      "The V3 goal, puck, and crease unit with brackets and grain omitted for display at 16 to 32 pixels.",
    puck: true,
    brackets: false,
    id: "small",
    viewBox: "126 126 166 166",
  }),
);

writeFileSync(
  join(svgDir, "cap-and-crease-mark-tight-horizontal.svg"),
  markSvg({
    title: "Cap & Crease V3 tight horizontal mark",
    description:
      "The unchanged V3 geometry on a tightly cropped horizontal canvas for navigation and compact layout use.",
    texture: true,
    id: "tight",
    viewBox: "20 96 376 218",
  }),
);

writeFileSync(
  join(svgDir, "cap-and-crease-mark-reversed.svg"),
  markSvg({
    title: "Cap & Crease V3 reversed mark",
    description:
      "The V3 mark rendered in cream, brick red, and ice blue for dark surfaces.",
    ink: PAPER,
    id: "reversed",
  }),
);

writeFileSync(
  join(svgDir, "cap-and-crease-mark-one-color-ink.svg"),
  markSvg({
    title: "Cap & Crease V3 one-colour ink mark",
    description:
      "The V3 mark rendered entirely in warm ink for single-colour reproduction.",
    ink: INK,
    red: INK,
    blue: INK,
    id: "one-ink",
  }),
);

writeFileSync(
  join(svgDir, "cap-and-crease-mark-one-color-cream.svg"),
  markSvg({
    title: "Cap & Crease V3 one-colour cream mark",
    description:
      "The V3 mark rendered entirely in cream for single-colour reproduction on dark surfaces.",
    ink: PAPER,
    red: PAPER,
    blue: PAPER,
    id: "one-cream",
  }),
);

writeFileSync(
  join(svgDir, "cap-and-crease-social-avatar.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" role="img" aria-labelledby="avatar-title avatar-desc">
  <title id="avatar-title">Cap &amp; Crease social avatar</title>
  <desc id="avatar-desc">The textured V3 mark centred on the Cap &amp; Crease paper colour.</desc>
  <rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${PAPER}"/>
  ${texturedMarkup({ id: "avatar" })}
</svg>
`,
);

function replaceFirstTransformedGroup(svg, replacement) {
  const groupPattern =
    /<g\s+transform="[^"]+"(?:\s+id="[^"]+")?\s*>[\s\S]*?<\/g>/;
  if (!groupPattern.test(svg)) {
    throw new Error("Could not locate the mark group in a lockup template.");
  }
  return svg.replace(groupPattern, replacement);
}

function ensureXlinkNamespace(svg) {
  return svg.includes("xmlns:xlink=")
    ? svg
    : svg.replace(
        'xmlns="http://www.w3.org/2000/svg"',
        'xmlns="http://www.w3.org/2000/svg"\n   xmlns:xlink="http://www.w3.org/1999/xlink"',
      );
}

function transformedTexturedGroup({ transform, id }) {
  return `<g transform="${transform}" id="${id}">
  ${texturedMarkup({ id })}
</g>`;
}

const lockupSpecs = [
  {
    template: "lockup-horizontal.svg",
    output: join(svgDir, "cap-and-crease-lockup-horizontal.svg"),
    transform: `translate(24 32) scale(${256 / VIEWBOX})`,
    id: "v3-horizontal-mark",
  },
  {
    template: "lockup-stacked.svg",
    output: join(svgDir, "cap-and-crease-lockup-stacked.svg"),
    transform: `translate(472 44) scale(${256 / VIEWBOX})`,
    id: "v3-stacked-mark",
  },
  {
    template: "social-card.svg",
    output: join(svgDir, "cap-and-crease-social-card.svg"),
    transform: `translate(80 178) scale(${(1.08 * 256) / VIEWBOX})`,
    id: "v3-social-mark",
  },
  {
    template: "seal.svg",
    output: join(svgDir, "cap-and-crease-seal.svg"),
    transform: `translate(153 153) scale(${(0.805 * 256) / VIEWBOX})`,
    id: "v3-seal-mark",
  },
];

for (const spec of lockupSpecs) {
  const template = readFileSync(join(templateDir, spec.template), "utf8");
  writeFileSync(
    spec.output,
    ensureXlinkNamespace(
      replaceFirstTransformedGroup(
        template,
        transformedTexturedGroup({
          transform: spec.transform,
          id: spec.id,
        }),
      ),
    ),
  );
}

const liveSpecs = [
  {
    template: "lockup-horizontal-live.svg",
    output: join(sourceDir, "lockup-horizontal-live.svg"),
    transform: `translate(24 32) scale(${256 / VIEWBOX})`,
    id: "v3-horizontal-live-mark",
  },
  {
    template: "lockup-stacked-live.svg",
    output: join(sourceDir, "lockup-stacked-live.svg"),
    transform: `translate(472 44) scale(${256 / VIEWBOX})`,
    id: "v3-stacked-live-mark",
  },
  {
    template: "social-card-live.svg",
    output: join(sourceDir, "social-card-live.svg"),
    transform: `translate(80 178) scale(${(1.08 * 256) / VIEWBOX})`,
    id: "v3-social-live-mark",
  },
  {
    template: "seal-live.svg",
    output: join(sourceDir, "seal-live.svg"),
    transform: `translate(153 153) scale(${(0.805 * 256) / VIEWBOX})`,
    id: "v3-seal-live-mark",
  },
];

for (const spec of liveSpecs) {
  const templatePath = join(templateDir, spec.template);
  if (existsSync(templatePath)) {
    const template = readFileSync(templatePath, "utf8");
    writeFileSync(
      spec.output,
      ensureXlinkNamespace(
        replaceFirstTransformedGroup(
          template,
          transformedTexturedGroup({
            transform: spec.transform,
            id: spec.id,
          }),
        ),
      ),
    );
  }
}

const faviconArtwork = shapeMarkup({ puck: true, brackets: false });
writeFileSync(
  join(faviconDir, "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="126 126 166 166" role="img" aria-label="Cap &amp; Crease">
  <rect x="126" y="126" width="166" height="166" rx="20" fill="${PAPER}"/>
  ${faviconArtwork}
</svg>
`,
);

writeFileSync(
  join(faviconDir, "icon-maskable.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="110 110 198 198" role="img" aria-label="Cap &amp; Crease">
  <rect x="110" y="110" width="198" height="198" fill="${PAPER}"/>
  ${faviconArtwork}
</svg>
`,
);

writeFileSync(
  join(faviconDir, "safari-pinned-tab.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
  ${shapeMarkup({ ink: "#000", red: "#000", blue: "#000", puck: false })}
</svg>
`,
);

console.log("Built Cap & Crease V3 source SVG assets.");
