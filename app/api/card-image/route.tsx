import React from "react";
import { ImageResponse } from "next/og";
import {
  validatePublicCardImagePayload,
  type CardImagePayload,
  type CardGravityInput,
} from "@/app/lib/card-payload";
import {
  computeRinkGeometry,
  rinkTierColor,
  zoneQualifier,
  ZONE_TITLE,
  RINK_INK,
  RINK_INK_FAINT,
  RINK_RED,
  RINK_NAVY,
  RINK_ICE,
} from "@/app/lib/gravity-rink";

/** Two letters from a name — the drawn stand-in for a player photo. */
function initialsForCard(name: string): string {
  const parts = (name ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z' -]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const runtime = "edge";

// ── Server-side player-card PNG ─────────────────────────────────────
// The client-side html2canvas export rendered black backgrounds in some
// browsers (Firefox especially) — it never honored the card's <style>-block
// class backgrounds. This route renders the identical card deterministically
// with Satori/next-og: no browser rendering quirks, a guaranteed-solid image
// every time. The browser POSTs a flat, already-formatted payload; this route
// is a pure renderer (see app/lib/card-payload.ts).

const CREAM = "#ede4cc";
const TAN = "#e4d8b8";
const PAPER_INSET = "#efe7d5";
const INSET = "#d6c8a5";
const INK = "#1c140a";
const INK_BODY = "#4a3820";
const INK_MID = "#3d2e18";
const INK_FAINT = "#6e5a3d";
const RULE = "#b8a070";
const BRAND_RED = "#7a1d16";

const fontRegular = fetch(new URL("./fonts/CourierPrime-Regular.ttf", import.meta.url)).then((r) =>
  r.arrayBuffer(),
);
const fontBold = fetch(new URL("./fonts/CourierPrime-Bold.ttf", import.meta.url)).then((r) =>
  r.arrayBuffer(),
);

// ── The Spacetime rink ──────────────────────────────────────────────
// Satori renders SVG shapes but NOT <text> nodes ("convert them to
// <path>"). So the lattice/rink/wells are drawn in a shapes-only <svg>,
// and every label is an absolutely-positioned HTML div overlaid on top —
// which also lets the labels use the loaded Courier Prime font cleanly.
const RINK_SCALE = 1.95;

function Label({
  x,
  y,
  size,
  color,
  anchor,
  ls = 0,
  opacity = 1,
  vbW,
  w = 92,
  children,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  anchor: "start" | "middle" | "end";
  ls?: number;
  opacity?: number;
  vbW: number;
  w?: number; // centered-box width in viewBox units (widen for long labels)
  children: React.ReactNode;
}) {
  const S = RINK_SCALE;
  const base: React.CSSProperties = {
    position: "absolute",
    top: (y - size * 0.8) * S, // SVG y is a baseline; approximate the CSS top
    display: "flex",
    fontFamily: "Courier Prime",
    fontWeight: 700,
    fontSize: size * S,
    color,
    letterSpacing: ls * S,
    opacity,
  };
  if (anchor === "middle") {
    return <div style={{ ...base, left: (x - w / 2) * S, width: w * S, justifyContent: "center", whiteSpace: "nowrap" }}>{children}</div>;
  }
  if (anchor === "end") {
    return <div style={{ ...base, right: (vbW - x) * S, justifyContent: "flex-end" }}>{children}</div>;
  }
  return <div style={{ ...base, left: x * S }}>{children}</div>;
}

function Rink({ gravity }: { gravity: CardGravityInput }) {
  const geo = computeRinkGeometry({ masses: gravity.masses });
  const { W, H, rinkX, rinkY, rinkW, rinkH, midY, centerX, blue1, blue2, rowLines, colLines, zones } = geo;
  const renderTier = gravity.tier ?? "ASTEROID";
  const tierLabel = gravity.tier ? gravity.tier.replace(/_/g, " ") : "UNTIERED";
  const color = rinkTierColor(renderTier);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const S = RINK_SCALE;

  return (
    <div style={{ position: "relative", display: "flex", width: W * S, height: H * S }}>
      <svg width={W * S} height={H * S} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {/* Rink outline */}
        <rect x={rinkX} y={rinkY} width={rinkW} height={rinkH} rx={22} fill={RINK_ICE} stroke={RINK_INK} strokeWidth={1.5} opacity={0.95} />

        {/* Blue lines + center red line */}
        <line x1={blue1} y1={rinkY + 2} x2={blue1} y2={rinkY + rinkH - 2} stroke={RINK_NAVY} strokeWidth={2.5} opacity={0.45} />
        <line x1={blue2} y1={rinkY + 2} x2={blue2} y2={rinkY + rinkH - 2} stroke={RINK_NAVY} strokeWidth={2.5} opacity={0.45} />
        <line x1={centerX} y1={rinkY + 2} x2={centerX} y2={rinkY + rinkH - 2} stroke={RINK_RED} strokeWidth={1.5} opacity={0.4} strokeDasharray="4 3" />

        {/* Goal lines */}
        <line x1={rinkX + 12} y1={rinkY + 6} x2={rinkX + 12} y2={rinkY + rinkH - 6} stroke={RINK_RED} strokeWidth={1} opacity={0.3} />
        <line x1={rinkX + rinkW - 12} y1={rinkY + 6} x2={rinkX + rinkW - 12} y2={rinkY + rinkH - 6} stroke={RINK_RED} strokeWidth={1} opacity={0.3} />

        {/* Spacetime lattice */}
        {rowLines.map((pts, i) => (
          <polyline key={`lr-${i}`} points={pts} fill="none" stroke={RINK_INK} strokeWidth={0.6} opacity={0.3} />
        ))}
        {colLines.map((pts, i) => (
          <polyline key={`lc-${i}`} points={pts} fill="none" stroke={RINK_INK} strokeWidth={0.6} opacity={0.3} />
        ))}

        {/* Mass cores */}
        {zones.map((zn) => {
          const mag = Math.abs(zn.m);
          if (mag < 0.05) return null;
          const healthy = zn.m > 0;
          const nodeColor = healthy ? color : RINK_RED;
          return (
            <g key={`core-${zn.key}`}>
              <circle cx={zn.cx} cy={midY} r={10 + mag * 8} fill={nodeColor} opacity={0.1 + mag * 0.12} />
              <circle
                cx={zn.cx}
                cy={midY}
                r={3 + mag * 3.5}
                fill={zn.repulsive && healthy ? RINK_ICE : nodeColor}
                stroke={nodeColor}
                strokeWidth={zn.repulsive && healthy ? 1.6 : 0}
                opacity={clamp(0.45 + mag * 0.5, 0, 0.95)}
              />
            </g>
          );
        })}
      </svg>

      {/* Text overlays */}
      <Label x={14} y={22} size={11} color={color} anchor="start" ls={1} vbW={W}>
        {tierLabel.toUpperCase()}
      </Label>
      <Label x={W - 14} y={22} size={18} color={color} anchor="end" vbW={W}>
        {gravity.force > 0 ? "+" : ""}
        {gravity.force.toFixed(2)}
      </Label>
      <Label x={W - 14} y={34} size={7} color={INK_FAINT} anchor="end" ls={1.3} vbW={W}>
        FIELD FORCE
      </Label>
      <Label x={W - 14} y={rinkY - 6} size={7} color={INK_FAINT} anchor="end" ls={1} opacity={0.7} vbW={W}>
        ATTACKING →
      </Label>

      {zones.map((zone) => {
        const healthy = zone.m > 0;
        const valColor = Math.abs(zone.m) < 0.05 ? INK_FAINT : healthy ? color : RINK_RED;
        const analyticalValue = gravity.modelVersion === "4.0"
          ? gravity.zoneXg82?.[zone.key] ?? null
          : null;
        return (
          <React.Fragment key={`label-${zone.key}`}>
            <Label x={zone.cx} y={rinkY + rinkH + 18} size={9} color={INK_FAINT} anchor="middle" ls={0.9} vbW={W}>
              {ZONE_TITLE[zone.key].toUpperCase()}
            </Label>
            <Label x={zone.cx} y={rinkY + rinkH + 34} size={14} color={valColor} anchor="middle" vbW={W}>
              {(analyticalValue ?? zone.m) > 0 ? "+" : ""}
              {(analyticalValue ?? zone.m).toFixed(analyticalValue === null ? 2 : 1)}
            </Label>
            <Label x={zone.cx} y={rinkY + rinkH + 45} size={7} color={INK_FAINT} anchor="middle" ls={0.4} opacity={0.8} vbW={W}>
              {analyticalValue === null
                ? (zoneQualifier(zone.key, zone.m) ?? "").toUpperCase()
                : "XG / 82"}
            </Label>
          </React.Fragment>
        );
      })}

      <Label x={W / 2} y={H - 6} size={8} color={INK_FAINT} anchor="middle" ls={1.6} vbW={W} w={260}>
        {gravity.fieldLabel}
      </Label>
    </div>
  );
}

function ordinal(value: number | null): string {
  if (value === null) return "UNAVAILABLE";
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "TH"
    : value % 10 === 1
      ? "ST"
      : value % 10 === 2
        ? "ND"
        : value % 10 === 3
          ? "RD"
          : "TH";
  return `${value}${suffix} PCT`;
}

function Stat({ row }: { row: CardImagePayload["stats"][number] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 9 }}>
      <div style={{ display: "flex", width: 96, fontWeight: 700, fontSize: 19, color: INK_MID }}>{row.label}</div>
      {row.pct !== null && row.barColor ? (
        <div style={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
          <div style={{ position: "relative", display: "flex", flexGrow: 1, height: 26, background: INSET, borderRadius: 3 }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${row.pct}%`, background: row.barColor, borderRadius: 3 }} />
            <div style={{ position: "absolute", left: "50%", top: -2, width: 2, height: 30, background: INK_FAINT }} />
          </div>
          <div style={{ display: "flex", width: 44, justifyContent: "flex-end", fontWeight: 700, fontSize: 19, color: INK }}>{row.pct}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexGrow: 1, fontSize: 15, fontWeight: 700, color: INK_FAINT }}>No data</div>
      )}
      <div style={{ display: "flex", width: 78, justifyContent: "flex-end", fontSize: 18, fontWeight: 700, color: INK }}>{row.formatted}</div>
      <div style={{ display: "flex", width: 68, justifyContent: "flex-end", fontSize: 15, color: INK_FAINT }}>{row.median}</div>
    </div>
  );
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Bad payload", { status: 400 });
  }
  const validation = validatePublicCardImagePayload(raw);
  if (!validation.success) {
    return new Response(validation.message, { status: 400 });
  }
  const data: CardImagePayload = validation.data;

  const [regular, bold] = await Promise.all([fontRegular, fontBold]);

  // Height is content-driven — sum the sections that are actually present so
  // there is no cream dead-space below a goalie card (no rink) or above a
  // short stat table.
  const CARD_W = 940;
  const headerH = 128;
  const contractH = 60;
  const gravityH = data.gravity ? 96 + 240 * 1.95 + 8 : 0;
  const edgeH = data.edgeCells.length > 0 ? 74 : 0;
  const statsBodyH = 46 + data.stats.length * 35 + 20;
  const sideBodyH = 46 + data.navCells.length * 40 + 16;
  const bodyH = Math.max(statsBodyH, sideBodyH);
  const footerH = 56;
  const CARD_H = headerH + contractH + gravityH + edgeH + bodyH + footerH;

  const img = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: CARD_W,
        height: CARD_H,
        background: CREAM,
        fontFamily: "Courier Prime",
        color: INK,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: TAN, padding: "18px 26px", height: headerH }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* Drawn, not photographed. This card is built to be shared, so
              embedding league-owned photography in it was redistribution —
              structural rather than incidental, because travelling is the
              point. Initials in type suit the paper better anyway. */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 80, height: 80, borderRadius: 4, marginRight: 16,
            background: PAPER_INSET, border: `2px solid ${INK}`,
            fontSize: 30, fontWeight: 700, color: INK,
          }}>
            {initialsForCard(data.name)}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: INK }}>{data.name}</div>
            <div style={{ display: "flex", fontSize: 15, color: INK_BODY, marginTop: 4 }}>{data.sub}</div>
            {data.roleLabel ? (
              <div style={{ display: "flex", fontSize: 14, fontWeight: 700, color: data.roleColor ?? INK, marginTop: 4 }}>{data.roleLabel}</div>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: INK, lineHeight: 1 }}>{String(data.xnavTotal)}</div>
          <div style={{ display: "flex", fontSize: 11, letterSpacing: 1, color: INK_BODY, marginTop: 4 }}>X-NAV · EXTENDED NET ASSET VALUE</div>
        </div>
      </div>

      {/* Contract strip */}
      <div style={{ display: "flex", alignItems: "center", background: CREAM, padding: "0 26px", height: contractH, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
        {[
          { lbl: "CAP HIT", val: data.capHitLabel, color: INK },
          { lbl: "YEARS", val: data.yearsLabel, color: INK },
          { lbl: "FMV", val: data.fmvLabel, color: INK },
          { lbl: "SURPLUS", val: data.surplusLabel, color: data.surplusColor },
        ].map((c) => (
          <div key={c.lbl} style={{ display: "flex", alignItems: "baseline", marginRight: 30 }}>
            <div style={{ display: "flex", fontSize: 11, fontWeight: 700, color: INK_BODY, letterSpacing: 1, marginRight: 8 }}>{c.lbl}</div>
            <div style={{ display: "flex", fontSize: 17, fontWeight: 700, color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Gravity */}
      {data.gravity ? (
        <div style={{ display: "flex", flexDirection: "column", background: TAN, padding: "12px 0 6px", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "0 26px", marginBottom: 4 }}>
            <div style={{ display: "flex", fontSize: 12, fontWeight: 700, color: INK_BODY, letterSpacing: 1 }}>PLAYER GRAVITY · MODELLED FIELD · POSITION-RELATIVE</div>
            <div style={{ display: "flex", fontSize: 12, fontWeight: 700, letterSpacing: 1, color: INK_BODY }}>{data.gravity.season} · {data.gravity.situation}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "3px 26px 1px", fontSize: 10, fontWeight: 700, color: INK_FAINT, letterSpacing: 0.5 }}>
            <div style={{ display: "flex" }}>{data.gravity.modelLabel}</div>
            <div style={{ display: "flex" }}>RELIABILITY {data.gravity.reliabilityLabel}</div>
            <div style={{ display: "flex" }}>DATA {data.gravity.coverageLabel}</div>
            <div style={{ display: "flex" }}>GRAVITY {ordinal(data.gravity.gravityPercentile)}</div>
            {data.gravity.modelVersion === "4.0" && data.gravity.netXg82 !== null ? (
              <div style={{ display: "flex" }}>
                NET {data.gravity.netXg82 > 0 ? "+" : ""}{data.gravity.netXg82.toFixed(1)} xG/82 · FIELD {data.gravity.force > 0 ? "+" : ""}{data.gravity.force.toFixed(2)}
              </div>
            ) : null}
          </div>
          <Rink gravity={data.gravity} />
          <div style={{ display: "flex", width: "100%", justifyContent: "center", padding: "0 26px 4px", fontSize: 9, color: INK_FAINT }}>
            {data.gravity.fieldDisclaimer}
          </div>
        </div>
      ) : null}

      {/* EDGE strip */}
      {data.edgeCells.length > 0 ? (
        <div style={{ display: "flex", background: CREAM, height: edgeH, borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
          {data.edgeCells.map((c, i) => (
            <div
              key={c.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexGrow: 1,
                flexBasis: 0,
                borderRight: i < data.edgeCells.length - 1 ? `1px solid ${INSET}` : "none",
              }}
            >
              <div style={{ display: "flex", fontSize: 11, fontWeight: 700, color: INK_BODY, letterSpacing: 0.5 }}>{c.label}</div>
              <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: c.color ?? INK, marginTop: 2 }}>{c.val}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Body: percentile table + value breakdown */}
      <div style={{ display: "flex", flexGrow: 1, background: CREAM }}>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1.6, flexBasis: 0, padding: "14px 18px" }}>
          <div style={{ display: "flex", fontSize: 12, fontWeight: 700, color: INK_BODY, marginBottom: 12, letterSpacing: 0.5 }}>
            PERCENTILES VS {data.peerLabel.toUpperCase()} (≥20 GP)
          </div>
          {data.stats.map((row) => (
            <Stat key={row.label} row={row} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, padding: "14px 20px", borderLeft: `1px solid ${RULE}` }}>
          <div style={{ display: "flex", fontSize: 12, fontWeight: 700, color: INK_BODY, marginBottom: 12, letterSpacing: 0.5 }}>VALUE BREAKDOWN</div>
          {data.navCells.map((c) => {
            const rounded = Math.round(c.val);
            const sign = c.val >= 0.5 ? "+" : c.val <= -0.5 ? "−" : "";
            return (
              <div key={c.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingTop: 8, paddingBottom: 8, borderBottom: `1px solid ${INSET}` }}>
                <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: INK_BODY }}>{c.label}</div>
                <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: rounded >= 0 ? INK : RINK_RED }}>
                  {sign}
                  {Math.abs(rounded)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: footerH, padding: "0 26px", background: CREAM, borderTop: `2px solid ${INK}` }}>
        <div style={{ display: "flex", fontSize: 14, fontWeight: 700, letterSpacing: 1, color: BRAND_RED }}>THE HOCKEY LEDGER</div>
        <div style={{ display: "flex", fontSize: 12, color: INK_FAINT }}>
          {data.avgPercentile !== null ? `avg ${data.avgPercentile}th pct vs ${data.peerLabel}` : `vs ${data.peerLabel}`}
        </div>
      </div>
    </div>
  );

  return new ImageResponse(img, {
    width: CARD_W,
    height: Math.round(CARD_H),
    fonts: [
      { name: "Courier Prime", data: regular, weight: 400, style: "normal" },
      { name: "Courier Prime", data: bold, weight: 700, style: "normal" },
    ],
  });
}
