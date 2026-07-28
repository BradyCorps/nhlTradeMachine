import { ImageResponse } from "next/og";
import { decodeTradeSharePayload, summarizeTradeSharePayload } from "@/app/lib/trade-share";

export const runtime = "edge";
export const alt = "Cap & Crease shared trade card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { code: string } }) {
  let preview = {
    title: "Shared Trade",
    description: "Open a shared NHL trade receipt from Cap & Crease.",
    matchupLabel: "Trade Receipt",
    packageLabel: "Shared trade package",
    verdictLabel: "LOCKED",
    createdLabel: "Cap & Crease",
  };

  try {
    preview = summarizeTradeSharePayload(decodeTradeSharePayload(params.code));
  } catch {}

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f3ead6",
          color: "#1c140a",
          padding: "58px 68px",
          border: "18px solid #1c140a",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 24, letterSpacing: 8, textTransform: "uppercase", color: "#7a1d16" }}>
            Cap & Crease
          </div>
          <div style={{ fontSize: 22, letterSpacing: 5, textTransform: "uppercase", color: "#6d5b37" }}>
            Shared Trade
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1 }}>
            {preview.matchupLabel}
          </div>
          <div style={{ fontSize: 34, color: "#3f321f", lineHeight: 1.25, maxWidth: 930 }}>
            {preview.packageLabel}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 22, letterSpacing: 5, textTransform: "uppercase", color: "#6d5b37" }}>
              Verdict Locked At Creation
            </div>
            <div style={{ fontSize: 28, color: "#3f321f" }}>
              {preview.createdLabel}
            </div>
          </div>
          <div
            style={{
              border: "8px solid #7a1d16",
              color: "#7a1d16",
              fontSize: 52,
              fontWeight: 900,
              letterSpacing: 7,
              padding: "18px 28px",
              transform: "rotate(-3deg)",
            }}
          >
            {preview.verdictLabel}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
