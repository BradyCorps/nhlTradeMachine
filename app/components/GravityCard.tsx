"use client";

import React, { useRef, useCallback } from "react";
import type { GravityProfile, GravityTier } from "@/app/lib/gravity";
import { gravityTierColor } from "@/app/lib/gravity";
import { TierIcon, FieldDiagram } from "@/app/components/GravityField";
import type { XNAVResult } from "@/app/lib/trade-types";

const TIER_LABEL: Record<GravityTier, string> = {
  SUPERMASSIVE: "Supermassive",
  STAR: "Star",
  MAIN_SEQUENCE: "Main Sequence",
  SATELLITE: "Satellite",
  ASTEROID: "Asteroid",
  BLACK_HOLE: "Black Hole",
};

interface GravityCardProps {
  playerName: string;
  teamName: string;
  position: string;
  age: number;
  headshot?: string | null;
  gravity: GravityProfile;
  xnav: XNAVResult;
  stats: {
    gp: number;
    goals?: number | null;
    assists?: number | null;
    pts: number;
    plusMinus?: number | null;
    toi: number;
  };
  capHit: number;
  yearsRemaining: number;
}

export default function GravityCard({
  playerName, teamName, position, age, headshot,
  gravity, xnav, stats, capHit, yearsRemaining,
}: GravityCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const exportPng = useCallback(async () => {
    if (!cardRef.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const rendered = await html2canvas(cardRef.current, {
      scale: 2,
      backgroundColor: "#ece0be", // solid, matches the plate (JPEG has no alpha)
      useCORS: true,
      width: cardRef.current.offsetWidth,
      windowWidth: cardRef.current.scrollWidth,
    });
    // Composite onto a pre-filled solid canvas so no transparency can
    // flatten to black in the JPEG.
    const out = document.createElement("canvas");
    out.width = rendered.width;
    out.height = rendered.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#ece0be";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(rendered, 0, 0);
    const link = document.createElement("a");
    link.download = `${playerName.replace(/\s+/g, "-").toLowerCase()}-gravity-card.jpg`;
    link.href = out.toDataURL("image/jpeg", 0.95);
    link.click();
  }, [playerName]);

  const tierColor = gravityTierColor(gravity.tier);
  const force = gravity.force;
  const pm = stats.plusMinus;

  const navComponents = [
    { label: "OFF", val: xnav.off },
    { label: "DEF", val: xnav.def },
    { label: "GRAV", val: xnav.grav ?? 0 },
    { label: "AGE", val: xnav.age },
    { label: "CAP", val: xnav.cap },
    { label: "UPS", val: xnav.upside },
  ];

  const zoneBars = [
    { name: "OZ Well", value: gravity.masses.oz },
    { name: "NZ Well", value: gravity.masses.nz },
    { name: "DZ Dome", value: gravity.masses.dz },
  ];

  return (
    <div>
      <div
        ref={cardRef}
        style={{
          width: 420,
          fontFamily: "'Courier Prime', ui-monospace, monospace",
          color: "#1c140a",
          background: "linear-gradient(160deg, #f5ecd0 0%, #ece0be 40%, #e4d6b0 100%)",
          border: "2px solid #1c140a",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Watermark orbital rings */}
        <svg
          width="200" height="200"
          viewBox="0 0 200 200"
          style={{ position: "absolute", top: -30, right: -30, opacity: 0.04, pointerEvents: "none" }}
          aria-hidden="true"
        >
          <circle cx="100" cy="100" r="90" stroke="#1c140a" strokeWidth="1.5" fill="none" />
          <circle cx="100" cy="100" r="65" stroke="#1c140a" strokeWidth="1" fill="none" />
          <circle cx="100" cy="100" r="40" stroke="#1c140a" strokeWidth="0.8" fill="none" />
          <circle cx="100" cy="100" r="15" fill="#1c140a" />
        </svg>

        {/* Header band */}
        <div style={{
          padding: "14px 16px 12px",
          borderBottom: "2px solid #1c140a",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          {headshot && (
            <img
              src={`/api/headshot?u=${encodeURIComponent(headshot)}`}
              alt=""
              style={{
                width: 52, height: 52,
                borderRadius: "50%",
                border: "2px solid #1c140a",
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 17,
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {playerName}
            </div>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "#6e5a3d",
              marginTop: 2,
            }}>
              {teamName} · {position} · Age {age}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: "#1c140a" }}>
              {xnav.total}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#6e5a3d" }}>
              X-NAV
            </div>
          </div>
        </div>

        {/* Gravity tier + force strip */}
        <div style={{
          padding: "10px 16px",
          borderBottom: "1px solid #c1b088",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TierIcon tier={gravity.tier} size={22} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: tierColor, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {TIER_LABEL[gravity.tier]}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#6e5a3d", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Gravity Tier
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: tierColor, fontVariantNumeric: "tabular-nums" }}>
              {force.toFixed(2)}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#6e5a3d", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Force
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          borderBottom: "1px solid #c1b088",
        }}>
          {[
            { label: "GP", val: stats.gp.toString() },
            { label: "G", val: stats.goals?.toString() ?? "—" },
            { label: "A", val: stats.assists?.toString() ?? "—" },
            { label: "PTS", val: stats.pts.toString() },
            { label: "+/−", val: pm != null ? `${pm > 0 ? "+" : ""}${pm}` : "—",
              color: pm != null ? (pm > 0 ? "#146a24" : pm < 0 ? "#9c2b1f" : undefined) : undefined },
            { label: "TOI", val: stats.toi.toFixed(1) },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center", padding: "8px 4px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6e5a3d" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, color: (s as any).color ?? "#1c140a", fontVariantNumeric: "tabular-nums" }}>
                {s.val}
              </div>
            </div>
          ))}
        </div>

        {/* Field diagram */}
        <div style={{ padding: "8px 16px 4px", borderBottom: "1px solid #c1b088" }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#6e5a3d", marginBottom: 4 }}>
            Gravity Field
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <FieldDiagram profile={gravity} />
          </div>
        </div>

        {/* Zone masses — the shape of the field */}
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #c1b088" }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#6e5a3d", marginBottom: 6 }}>
            Field Masses — Where the Rink Curves
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {zoneBars.map(m => {
              const mag = Math.min(Math.abs(m.value), 1);
              const pct = Math.max(mag * 100, 3);
              const positive = m.value >= 0;
              return (
                <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 70, fontSize: 9, fontWeight: 900, textAlign: "right", color: "#4a3820", letterSpacing: "0.06em", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name}
                  </span>
                  <div style={{ flex: 1, height: 12, position: "relative", background: "#e0d3ac", border: "1px solid #c1b088", borderRadius: 2 }}>
                    <div style={{
                      position: "absolute", top: 0, height: "100%", borderRadius: 1,
                      width: `${pct}%`,
                      left: 0,
                      background: !positive ? "#9c2b1f" : mag >= 0.5 ? "#146a24" : mag >= 0.25 ? "#1a2e5c" : "#6e5a3d",
                      opacity: 0.65,
                    }} />
                  </div>
                  <span style={{ width: 36, fontSize: 10, fontWeight: 900, textAlign: "right", fontVariantNumeric: "tabular-nums", color: !positive ? "#9c2b1f" : mag >= 0.5 ? "#146a24" : "#1c140a" }}>
                    {m.value > 0 ? "+" : ""}{m.value.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* NAV Components */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          borderBottom: "1px solid #c1b088",
        }}>
          {navComponents.map(c => (
            <div key={c.label} style={{ textAlign: "center", padding: "8px 4px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6e5a3d" }}>
                {c.label}
              </div>
              <div style={{ fontSize: 12, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: c.val > 0 ? "#146a24" : c.val < 0 ? "#9c2b1f" : "#1c140a" }}>
                {c.val > 0 ? "+" : ""}{c.val}
              </div>
            </div>
          ))}
        </div>

        {/* Contract + market footer */}
        <div style={{
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6e5a3d" }}>
              Contract
            </div>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#1c140a" }}>
              ${capHit.toFixed(1)}M × {yearsRemaining}yr
            </div>
          </div>
          {xnav.fmvAav != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6e5a3d" }}>
                Market AAV
              </div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#1c140a" }}>
                ${xnav.fmvAav.toFixed(1)}M
              </div>
            </div>
          )}
        </div>

        {/* Branding footer */}
        <div style={{
          padding: "6px 16px",
          borderTop: "2px solid #1c140a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(28, 20, 10, 0.04)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", color: "#4a3820" }}>
            THE HOCKEY LEDGER
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ opacity: 0.5 }}>
              <circle cx="9" cy="9" r="7" stroke="#4a3820" strokeWidth="0.8" fill="none" />
              <circle cx="9" cy="9" r="4.5" stroke="#4a3820" strokeWidth="0.6" fill="none" />
              <circle cx="9" cy="9" r="2" stroke="#4a3820" strokeWidth="0.4" fill="none" />
              <circle cx="9" cy="9" r="0.8" fill="#4a3820" />
            </svg>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#6e5a3d", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              Gravity Analytics
            </span>
          </div>
        </div>
      </div>

      {/* Export button (outside the card for PNG capture) */}
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button
          onClick={exportPng}
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: 10,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            padding: "6px 14px",
            border: "1.5px solid var(--ledger-ink, #1c140a)",
            background: "var(--paper-card, #f5ecd0)",
            color: "var(--ledger-ink, #1c140a)",
            cursor: "pointer",
          }}
        >
          Export Card (JPG)
        </button>
      </div>
    </div>
  );
}
