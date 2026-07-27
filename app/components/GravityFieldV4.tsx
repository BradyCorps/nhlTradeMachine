"use client";

import React from "react";
import { FieldDiagram, TierIcon } from "@/app/components/GravityField";
import { gravityTierColor } from "@/app/lib/gravity";
import { toGravityRinkDisplayProfile } from "@/app/lib/gravity-v4/display";
import type {
  GravityProfileV4,
  GravityZoneEstimate,
} from "@/app/lib/gravity-v4/types";

interface Props {
  profile: GravityProfileV4;
  playerName: string;
}

const fmt = (value: number, digits = 2) =>
  `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

const intervalText = (interval: GravityZoneEstimate["interval"]) =>
  interval ? `${fmt(interval.low, 1)} to ${fmt(interval.high, 1)}` : "Not available";

const TIER_LABEL = {
  SUPERMASSIVE: "Supermassive",
  STAR: "Star",
  MAIN_SEQUENCE: "Main Sequence",
  SATELLITE: "Satellite",
  ASTEROID: "Asteroid",
  BLACK_HOLE: "Black Hole",
} as const;

export default function GravityFieldV4({ profile, playerName }: Props) {
  const rinkProfile = toGravityRinkDisplayProfile(profile);
  const tierLabel = profile.tier ? TIER_LABEL[profile.tier] : "Untiered";
  const color = profile.tier
    ? gravityTierColor(profile.tier)
    : "var(--ledger-ink-faint)";
  const diagnostic = profile.metadata.artifactKind === "diagnostic_fixture";
  const zones: Array<{
    key: "oz" | "nz" | "dz";
    title: string;
    meaning: string;
    value: GravityZoneEstimate;
  }> = [
    {
      key: "oz",
      title: "OZ Well",
      meaning: "Teammate expected goals added after offensive possession is established.",
      value: profile.zones.oz,
    },
    {
      key: "nz",
      title: "NZ Well",
      meaning: "Transition expected-goal value added.",
      value: profile.zones.nz,
    },
    {
      key: "dz",
      title: "DZ Dome",
      meaning: "Opponent expected goals prevented; positive is good.",
      value: profile.zones.dz,
    },
  ];

  return (
    <div
      className="font-mono"
      role="region"
      aria-label={`Territorial Gravity v4 analysis for ${playerName}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div
            className="text-[11px] font-black uppercase tracking-[0.15em]"
            style={{ color: "var(--ledger-ink-faint)" }}
          >
            Territorial Gravity · Modelled Field
          </div>
          <div
            className="text-[9px] font-black uppercase tracking-[0.1em] mt-0.5"
            style={{ color: diagnostic ? "var(--ledger-red)" : "var(--ledger-ink-faint)" }}
          >
            V4 {diagnostic ? "Diagnostic Fixture" : "Diagnostic"} · {profile.season} · 5v5
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-[11px] font-black uppercase tracking-[0.1em]"
            style={{ color: "var(--ledger-ink-faint)" }}
          >
            {playerName}
          </div>
          <div
            className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.08em]"
            style={{ color }}
          >
            {profile.tier && <TierIcon tier={profile.tier} size={12} />}
            {tierLabel}
          </div>
        </div>
      </div>

      <div
        className="border px-3 py-2 mb-3 text-[10px] leading-relaxed"
        style={{
          borderColor: diagnostic ? "var(--ledger-red)" : "var(--ledger-rule)",
          background: "var(--paper-inset)",
          color: "var(--ledger-ink-faint)",
        }}
      >
        {diagnostic
          ? "Zero-value schema fixture only. It was not fitted, is not a player rating, and is not used by X-NAV."
          : "Diagnostic-only model output. Gravity v4 remains excluded from X-NAV until the held-out validation gates pass."}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <div
          className="border p-2"
          style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}
        >
          <FieldDiagram
            profile={rinkProfile}
            tierLabel={tierLabel}
            reliabilityLabel={`${profile.reliability} reliability band`}
            forceLabel="FIELD FORCE"
          />
        </div>

        <div className="flex flex-col gap-1.5" role="list" aria-label="Territorial Gravity zone estimates">
          {zones.map(zone => (
            <div
              key={zone.key}
              className="border px-2.5 py-2"
              style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
              role="listitem"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--ledger-ink-faint)" }}>
                  {zone.title}
                </div>
                <div className="text-[15px] font-black" style={{ color, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(zone.value.xg82, 1)} xG/82
                </div>
              </div>
              <div className="text-[9px] mt-1 leading-snug" style={{ color: "var(--ledger-ink-faint)" }}>
                {zone.meaning}
              </div>
              <div className="text-[9px] mt-1" style={{ color: "var(--ledger-ink-faint)" }}>
                90% interval: {intervalText(zone.value.interval)} · Data: {zone.value.dataQuality}
                {zone.key === "nz" ? ` (${profile.transitionDataQuality})` : ""}
              </div>
              <div className="text-[9px]" style={{ color: "var(--ledger-ink-faint)" }}>
                Position pct: {zone.value.positionPercentile ?? "—"} · League pct: {zone.value.leaguePercentile ?? "—"} · Sample: {zone.value.sampleMinutes.toFixed(0)} min
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-3 border p-3"
        style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-bg)" }}
      >
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {[
            ["NET xG / 82", fmt(profile.netXg82, 1)],
            ["FIELD FORCE", fmt(profile.displayForce)],
            ["RELIABILITY", profile.reliability],
            ["DATA QUALITY", profile.dataQuality],
            ["90% INTERVAL", profile.netInterval ? `${fmt(profile.netInterval.low, 1)} to ${fmt(profile.netInterval.high, 1)}` : "—"],
            ["POSITION PCT", profile.positionPercentile ?? "—"],
            ["LEAGUE PCT", profile.leaguePercentile ?? "—"],
            ["PORTABILITY", profile.portabilityLabel],
          ].map(([label, value]) => (
            <div key={label} className="border p-2" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
              <div className="text-[8px] font-black uppercase tracking-[0.1em]" style={{ color: "var(--ledger-ink-faint)" }}>
                {label}
              </div>
              <div className="text-[11px] font-black mt-0.5" style={{ color }}>
                {value}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[9px] mt-2 leading-relaxed" style={{ color: "var(--ledger-ink-faint)" }}>
          The field is a model visualization, not an observed player-tracking heatmap. Positive wells and domes represent estimated expected-goal impact in each phase of play.
        </p>
      </div>
    </div>
  );
}
