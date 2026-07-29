import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(sourceDir, "..");
const svgDir = path.join(kitRoot, "assets", "svg");

const ampersandSvg = fs.readFileSync(
  path.join(svgDir, "cap-and-crease-ampersand.svg"),
  "utf8",
);
const ampersandPath = ampersandSvg.match(/<path[\s\S]*?\/>/)?.[0];

if (!ampersandPath) {
  throw new Error("Could not find the signature ampersand path.");
}

const colours = {
  ink: "#1c140a",
  paper: "#f2ecd7",
  red: "#b83020",
  brass: "#b8a070",
  blue: "#79afc1",
};

function signatureAmpersand(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">${ampersandPath}</g>`;
}

function primaryMark({
  ink = colours.ink,
  red = colours.red,
  blue = colours.blue,
  puck = ink,
  includePuck = true,
  oneColour = false,
} = {}) {
  const crease = oneColour
    ? `<path d="M140 70a58 58 0 0 1 0 116V70Z" fill="none" stroke="${ink}" stroke-width="9" stroke-linejoin="round"/>`
    : `<path fill="${blue}" d="M140 70a58 58 0 0 1 0 116V70Z"/>`;

  return [
    `<path fill="${ink}" d="M28 20h48v26H52v164h24v26H28l-16-16V36L28 20Z"/>`,
    `<path fill="${ink}" d="M228 20h-48v26h24v164h-24v26h48l16-16V36l-16-16Z"/>`,
    crease,
    `<path d="M128 82H84v92h44" fill="none" stroke="${oneColour ? ink : red}" stroke-width="10" stroke-linecap="square" stroke-linejoin="round"/>`,
    `<path fill="${oneColour ? ink : red}" d="M130 62h10v134h-10z"/>`,
    includePuck ? `<circle cx="106" cy="146" r="9" fill="${puck}"/>` : "",
  ].join("\n    ");
}

function document({ width, height, title, body, viewBox = `0 0 ${width} ${height}` }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">
  <title>${title}</title>
${body}
</svg>
`;
}

fs.writeFileSync(
  path.join(sourceDir, "wordmark-live.svg"),
  document({
    width: 1280,
    height: 240,
    title: "Cap &amp; Crease wordmark",
    body: `  <text x="20" y="176" fill="${colours.ink}" font-family="Bodoni Moda" font-size="166" font-weight="400" letter-spacing="1">CAP</text>
  ${signatureAmpersand(379.5, 16, 0.22)}
  <text x="605" y="176" fill="${colours.ink}" font-family="Bodoni Moda" font-size="166" font-weight="400" letter-spacing="1">CREASE</text>`,
  }),
);

fs.writeFileSync(
  path.join(sourceDir, "lockup-horizontal-live.svg"),
  document({
    width: 1560,
    height: 320,
    title: "Cap &amp; Crease horizontal logo lockup",
    body: `  <g transform="translate(24 32)">
    ${primaryMark()}
  </g>
  <path d="M304 64v192" stroke="${colours.brass}" stroke-width="2"/>
  <text x="346" y="221" fill="${colours.ink}" font-family="Bodoni Moda" font-size="158" font-weight="400">CAP</text>
  ${signatureAmpersand(687, 45, 0.22)}
  <text x="913" y="221" fill="${colours.ink}" font-family="Bodoni Moda" font-size="158" font-weight="400">CREASE</text>`,
  }),
);

fs.writeFileSync(
  path.join(sourceDir, "lockup-stacked-live.svg"),
  document({
    width: 1200,
    height: 720,
    title: "Cap &amp; Crease stacked logo lockup",
    body: `  <g transform="translate(472 44)">
    ${primaryMark()}
  </g>
  <path d="M156 352h382m124 0h382" stroke="${colours.brass}" stroke-width="3"/>
  <path d="M600 342l10 10-10 10-10-10 10-10Z" fill="${colours.brass}"/>
  <text x="46" y="590" fill="${colours.ink}" font-family="Bodoni Moda" font-size="150" font-weight="400">CAP</text>
  ${signatureAmpersand(371.5, 440.5, 0.2)}
  <text x="580" y="590" fill="${colours.ink}" font-family="Bodoni Moda" font-size="150" font-weight="400">CREASE</text>`,
  }),
);

fs.writeFileSync(
  path.join(sourceDir, "social-card-live.svg"),
  document({
    width: 1200,
    height: 630,
    title: "Cap &amp; Crease social card",
    body: `  <rect width="1200" height="630" fill="${colours.paper}"/>
  <path d="M72 76h440M688 76h440M72 554h440M688 554h440" stroke="${colours.brass}" stroke-width="3"/>
  <path d="M594 66l10 10-10 10-10-10 10-10ZM594 544l10 10-10 10-10-10 10-10Z" fill="${colours.brass}"/>
  <g transform="translate(80 178) scale(1.08)">
    ${primaryMark()}
  </g>
  <text x="390" y="334" fill="${colours.ink}" font-family="Bodoni Moda" font-size="102" font-weight="400">CAP</text>
  ${signatureAmpersand(618.5, 229, 0.14)}
  <text x="766" y="334" fill="${colours.ink}" font-family="Bodoni Moda" font-size="102" font-weight="400">CREASE</text>
  <text x="394" y="395" fill="#4a3820" font-family="DejaVu Sans Mono" font-size="20" letter-spacing="5">CAPANDCREASE.COM</text>`,
  }),
);

fs.writeFileSync(
  path.join(sourceDir, "seal-live.svg"),
  document({
    width: 512,
    height: 512,
    title: "Cap &amp; Crease publisher's seal",
    body: `  <circle cx="256" cy="256" r="224" fill="none" stroke="${colours.brass}" stroke-width="7"/>
  <circle cx="256" cy="256" r="208" fill="none" stroke="${colours.brass}" stroke-width="2"/>
  <text x="256" y="142" fill="${colours.ink}" font-family="Bodoni Moda" font-size="38" letter-spacing="7" text-anchor="middle">ON RECORD</text>
  <text x="256" y="402" fill="${colours.ink}" font-family="Bodoni Moda" font-size="34" letter-spacing="6" text-anchor="middle">EST. 2026</text>
  <path fill="${colours.brass}" d="M62 256l10-10 10 10-10 10-10-10Zm368 0 10-10 10 10-10 10-10-10Z"/>
  <g transform="translate(153 153) scale(.805)">
    ${primaryMark()}
  </g>`,
  }),
);

const marks = [
  {
    name: "cap-and-crease-mark-primary.svg",
    title: "Cap &amp; Crease Blue Paint mark",
    desc: "A top-down hockey goal, puck in the net, and right-facing blue crease framed by editorial brackets.",
    body: primaryMark(),
  },
  {
    name: "cap-and-crease-mark-primary-no-puck.svg",
    title: "Cap &amp; Crease Blue Paint compact mark",
    desc: "A compact top-down hockey goal and right-facing blue crease framed by editorial brackets.",
    body: primaryMark({ includePuck: false }),
  },
  {
    name: "cap-and-crease-mark-reversed.svg",
    title: "Cap &amp; Crease reversed mark",
    desc: "Cream editorial brackets around a red goal, cream puck in the net, and right-facing blue crease.",
    body: primaryMark({ ink: colours.paper, puck: colours.paper }),
  },
  {
    name: "cap-and-crease-mark-one-color-ink.svg",
    title: "Cap &amp; Crease one-colour ink mark",
    desc: "One-colour top-down hockey goal, puck in the net, and right-facing outlined crease framed by brackets.",
    body: primaryMark({ oneColour: true }),
  },
  {
    name: "cap-and-crease-mark-one-color-cream.svg",
    title: "Cap &amp; Crease one-colour cream mark",
    desc: "One-colour cream top-down hockey goal, puck in the net, and right-facing outlined crease framed by brackets.",
    body: primaryMark({
      ink: colours.paper,
      puck: colours.paper,
      oneColour: true,
    }),
  },
];

for (const mark of marks) {
  fs.writeFileSync(
    path.join(svgDir, mark.name),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="title desc">
  <title id="title">${mark.title}</title>
  <desc id="desc">${mark.desc}</desc>
  ${mark.body}
</svg>
`,
  );
}

for (const variant of [
  {
    name: "cap-and-crease-ampersand-one-color-ink.svg",
    title: "Cap &amp; Crease signature ampersand in warm black",
    colour: colours.ink,
  },
  {
    name: "cap-and-crease-ampersand-one-color-cream.svg",
    title: "Cap &amp; Crease signature ampersand in cream",
    colour: colours.paper,
  },
]) {
  fs.writeFileSync(
    path.join(svgDir, variant.name),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="48 52 904 840" role="img" aria-labelledby="title">
  <title id="title">${variant.title}</title>
  ${ampersandPath.replaceAll(colours.red, variant.colour)}
</svg>
`,
  );
}

console.log("Cap & Crease editable source assets rebuilt.");
