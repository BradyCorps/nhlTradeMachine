"use client";

import React from "react";
import { calcPlayerTimeline } from "@/app/lib/player-timeline";
import { calcNAV, type AssetInput } from "@/app/lib/xnav-engine";

import { navColor, fmtSigned } from "@/app/lib/display-utils";

function NavBreakdown({ nav }: { nav: { off: number; def: number; age: number; cap: number; upside: number; noivImpact?: number } }) {
  const rows: { label: string; val: number; desc: string }[] = [
    { label: "OFF", val: nav.off, desc: "Scoring, expected goals, point production" },
    { label: "DEF", val: nav.def, desc: "Defensive impact, suppression, shutdown value" },
    { label: nav.age >= 0 ? "YNG" : "AGE", val: nav.age, desc: nav.age >= 0 ? "Youth premium — cost-controlled upside" : "Age curve — decline-phase discount" },
    { label: "CAP", val: nav.cap, desc: nav.cap >= 0 ? "Contract surplus — paid below market value" : "Contract drag — paid above market value" },
  ];
  if (nav.upside > 0) rows.push({ label: "UPS", val: nav.upside, desc: "Upside premium — team control and development" });
  if (nav.noivImpact && Math.abs(nav.noivImpact) >= 2) rows.push({ label: "NOIV", val: nav.noivImpact, desc: nav.noivImpact > 0 ? "Elevates teammates beyond raw stats" : "On-ice context reduces value vs raw stats" });

  const maxAbs = Math.max(...rows.map(r => Math.abs(r.val)), 1);

  return (
    <div style={{ marginBottom: 10 }}>
      <div className="ptl-sech"><span>What drives the valuation</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {rows.map(r => {
          const pct = (Math.abs(r.val) / maxAbs) * 100;
          const isPos = r.val >= 0;
          return (
            <div key={r.label} title={r.desc} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 32, fontSize: 10, fontWeight: 900, textAlign: "right", color: "#4a3820", letterSpacing: "0.08em" }}>{r.label}</span>
              <div style={{ flex: 1, height: 14, position: "relative", background: "#e0d3ac", border: "1px solid #c1b088", borderRadius: 3 }}>
                <div style={{
                  position: "absolute", top: 0, height: "100%", borderRadius: 2,
                  width: `${Math.max(pct, 2)}%`,
                  left: isPos ? 0 : undefined, right: isPos ? undefined : 0,
                  background: isPos ? "var(--ledger-green)" : "var(--ledger-red)",
                  opacity: 0.7,
                }} />
              </div>
              <span style={{ width: 44, fontSize: 11, fontWeight: 900, textAlign: "right", fontVariantNumeric: "tabular-nums", color: isPos ? "var(--ledger-green)" : "var(--ledger-red)" }}>
                {fmtSigned(r.val, 0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function estimateNextContractTerm(asset: AssetInput, nav: { total: number; fmvAav?: number; isRFA?: boolean }): number {
  const signingAge = asset.age + Math.max(0, asset.yearsRemaining ?? 0);
  const fmvAav = nav.fmvAav ?? asset.capHit;
  const isRFA = nav.isRFA ?? signingAge <= 27;

  // Simple market heuristic: term follows team-control status, age at signing,
  // and whether the player prices as a core asset or a depth/replacement bet.
  if (fmvAav < 2.5 || nav.total < 35) return signingAge >= 31 ? 1 : 2;
  if (isRFA && signingAge <= 25 && (nav.total >= 140 || fmvAav >= 8.5)) return 8;
  if (isRFA && signingAge <= 27) return nav.total >= 75 ? 5 : 3;
  if (signingAge <= 30) return nav.total >= 100 || fmvAav >= 7.5 ? 6 : 4;
  if (signingAge <= 33) return nav.total >= 80 || fmvAav >= 6.0 ? 3 : 2;
  return nav.total >= 65 || fmvAav >= 5.0 ? 2 : 1;
}

export default function PlayerTimeline({ asset }: { asset: AssetInput }) {
  const years = calcPlayerTimeline(asset);
  if (years.length === 0) return null;

  const currentNav = calcNAV(asset);
  const nextAav = currentNav.fmvAav ?? asset.capHit;
  const nextTerm = estimateNextContractTerm(asset, currentNav);
  const nextStatus = currentNav.isRFA ? "RFA" : "UFA";
  const signingAge = asset.age + Math.max(0, asset.yearsRemaining ?? 0);

  // Is the CURRENT deal a bargain? Market AAV (FMV) vs what he's actually paid.
  const surplus = nextAav - asset.capHit;
  const surplusTone = surplus >= 1 ? "good" : surplus <= -1 ? "bad" : "neutral";
  const surplusWord = surplus >= 1 ? "BARGAIN" : surplus <= -1 ? "OVERPAY" : "FAIR";

  // Trajectory across the deal (first → last projected value).
  const first = years[0].nav;
  const last = years[years.length - 1].nav;
  const delta = last - first;
  const trajectory = delta >= 15 ? "RISING" : delta <= -15 ? "DECLINING" : "HOLDS STEADY";
  const trajTone = delta >= 15 ? "good" : delta <= -20 ? "bad" : "neutral";

  const maxNav = Math.max(...years.map(y => y.nav), 50);
  const minNav = Math.min(...years.map(y => y.nav), 0);
  const span = Math.max(maxNav - Math.min(minNav, 0), 1);

  const GOOD = "#146a24", BAD = "#9c2b1f", INK = "#1c140a", BODY = "#4a3820";
  const toneColor = (t: string) => t === "good" ? GOOD : t === "bad" ? BAD : "#1a2e5c";

  const avgNav = Math.round(years.reduce((s, y) => s + y.nav, 0) / years.length);
  const trajSentence = avgNav < 0
    ? "Negative trade value across the deal — an anchor contract that's hard to move without a sweetener."
    : delta >= 15
      ? "Projected trade value climbs across the deal — the term itself is an asset."
      : delta <= -20
        ? "Projected trade value falls across the deal — an aging or back-loaded contract."
        : "Projected trade value holds across the deal — a stable, movable contract.";

  return (
    <div className="ptl">
      <style>{`
        .ptl { font-family: 'Courier Prime', ui-monospace, monospace; color: #1c140a; }
        .ptl *:focus-visible { outline: 2px solid #1a2e5c; outline-offset: 2px; }
        .ptl-h { font-size: 11px; font-weight: 900; color: #4a3820; text-transform: uppercase;
          letter-spacing: 0.15em; margin-bottom: 8px; }
        .ptl-deal { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
          gap: 8px; padding: 8px 10px; background: var(--ledger-card); border: 1px solid var(--ledger-rule-mid);
          margin-bottom: 10px; }
        .ptl-deal-label { font-size: 10px; font-weight: 700; color: #4a3820; text-transform: uppercase; letter-spacing: 0.1em; }
        .ptl-deal-val { font-size: 14px; font-weight: 900; color: #1c140a; }
        .ptl-chip { font-size: 11px; font-weight: 900; padding: 3px 8px; border: 1px solid var(--ledger-rule); background: rgba(255,255,255,0.3); white-space: nowrap; }
        .ptl-sech { display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
          font-size: 10px; font-weight: 700; color: #4a3820; text-transform: uppercase; letter-spacing: 0.1em;
          margin-bottom: 6px; }
        .ptl-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        .ptl-table th, .ptl-table td { padding: 4px 6px; }
        .ptl-table thead th { font-size: 10px; font-weight: 700; color: #4a3820; text-transform: uppercase;
          letter-spacing: 0.06em; border-bottom: 1px solid #cdbd93; text-align: left; }
        .ptl-yr { font-size: 12px; font-weight: 900; color: #3d2e18; white-space: nowrap; }
        .ptl-age { font-size: 12px; font-weight: 700; color: #6e5a3d; font-variant-numeric: tabular-nums; }
        .ptl-barcell { width: 99%; }
        .ptl-barrow { display: flex; align-items: center; gap: 8px; }
        .ptl-bartrack { position: relative; flex: 1; min-width: 70px; height: 16px; background: #e0d3ac;
          border: 1px solid #c1b088; border-radius: 3px; overflow: hidden; }
        .ptl-zero { position: absolute; top: 0; height: 100%; width: 2px; background: #1c140a; opacity: 0.4; }
        .ptl-fill { position: absolute; top: 0; height: 100%; }
        .ptl-navnum { font-size: 12px; font-weight: 900; font-variant-numeric: tabular-nums; min-width: 40px; text-align: right; }
        .ptl-ext { display: inline-block; margin-left: 6px; font-size: 9px; font-weight: 900; color: #8a5c00;
          border: 1px solid #8a5c00; padding: 0 3px; letter-spacing: 0.08em; }
        .ptl-next { padding: 9px 10px; background: var(--ledger-warm); border: 1px solid var(--ledger-rule-mid); margin-top: 8px; }
        .ptl-next-top { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px; }
        .ptl-next-label { font-size: 10px; font-weight: 700; color: #4a3820; text-transform: uppercase; letter-spacing: 0.1em; }
        .ptl-next-val { font-size: 15px; font-weight: 900; color: #1c140a; }
        .ptl-note { font-size: 11px; line-height: 1.5; color: #4a3820; margin-top: 8px; }
        .ptl-note b { color: #1c140a; }
      `}</style>

      <div className="ptl-h">Contract Projection</div>

      {/* Current deal + is it a bargain? */}
      <div className="ptl-deal">
        <div>
          <div className="ptl-deal-label">Current deal</div>
          <div className="ptl-deal-val">
            ${asset.capHit.toFixed(2)}M × {asset.yearsRemaining}yr
            <span style={{ fontSize: 11, fontWeight: 700, color: BODY }}> · ends age {signingAge}</span>
          </div>
        </div>
        <div className="ptl-chip" title="Estimated open-market AAV (FMV) vs the player's actual cap hit."
          style={{ color: toneColor(surplusTone) }}>
          {surplus > 0 ? "+" : surplus < 0 ? "−" : ""}${Math.abs(surplus).toFixed(1)}M vs market · {surplusWord}
        </div>
      </div>

      {/* NAV component breakdown */}
      <NavBreakdown nav={currentNav} />

      {/* Value across the deal */}
      <div className="ptl-sech">
        <span>Trade value (NAV) by contract year</span>
        <span style={{ color: toneColor(trajTone), fontWeight: 900 }}>{trajectory}</span>
      </div>
      <table className="ptl-table">
        <caption className="sr-only">Projected trade value (NAV) for each remaining year of the current contract</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Age</th>
            <th scope="col">Trade value (NAV)</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y, i) => {
            const isExt = i > 0 && y.capHit !== years[0].capHit && years[i - 1].capHit === years[0].capHit;
            const zeroX = (Math.max(0, -Math.min(minNav, 0)) / span) * 100;
            const fillW = (Math.abs(y.nav) / span) * 100;
            const fillLeft = y.nav >= 0 ? zeroX : zeroX - fillW;
            return (
              <tr key={y.year}>
                <th scope="row" className="ptl-yr">
                  Yr {y.year}
                  {isExt && <span className="ptl-ext" title="Extension — a different cap hit begins here">EXT</span>}
                </th>
                <td className="ptl-age">{y.age}</td>
                <td className="ptl-barcell">
                  <div className="ptl-barrow">
                    <div className="ptl-bartrack" role="img" aria-label={`Year ${y.year}, age ${y.age}: trade value ${y.nav} NAV`}>
                      {minNav < 0 && <div className="ptl-zero" style={{ left: `${zeroX}%` }} />}
                      <div className="ptl-fill" style={{ left: `${fillLeft}%`, width: `${fillW}%`, background: navColor(y.nav) }} />
                    </div>
                    <span className="ptl-navnum" style={{ color: navColor(y.nav) }}>{y.nav > 0 ? `+${y.nav}` : y.nav}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Projected next contract */}
      <div className="ptl-next">
        <div className="ptl-next-top">
          <span className="ptl-next-label">Projected next contract</span>
          <span className="ptl-next-val">${nextAav.toFixed(1)}M × {nextTerm}yr ({nextStatus})</span>
        </div>
        <div className="ptl-note">
          Signs at <b>age {signingAge}</b> as a{nextStatus === "RFA" ? "n" : ""} <b>{nextStatus === "RFA" ? "restricted" : "unrestricted"} free agent</b>.
          The AAV is a <b>fair-market midpoint</b> at today's cap — what the model expects him to command, not a player max or a team-friendly floor. Term follows age and value tier.
        </div>
      </div>

      <p className="ptl-note">{trajSentence}</p>
    </div>
  );
}
