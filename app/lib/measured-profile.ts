// ── Measured Profile — sim drivers as percentiles, not ratings ──
// The honest alternative to a 0-99 rating: every dimension is anchored to a
// documented real-NHL reference band (not an invented scale) and shows the raw
// measured value alongside its percentile. These are exactly the signals the
// engine reasons over — production, ice time (opportunity), EDGE burst
// (explosiveness), EDGE finishing luck, and draft/NHLe pedigree — so the card
// makes the sim legible instead of hiding it behind a made-up number.
//
// Reference bands are ~p10→p90 of the real NHL population by position (audited
// against public MoneyPuck / NHL EDGE ranges). Pure and deterministic; a
// dimension with no measured sample is flagged so the UI can grey it out
// rather than invent a value.

import type { Asset } from "@/app/lib/trade-types";

export type ProfileTone = "good" | "warn" | "neutral" | "none";

export interface ProfileDimension {
  key: string;
  label: string;
  pct: number;          // 0-100 percentile vs the real-NHL reference band
  rawLabel: string;     // the measured value, e.g. "62 pts/82", "22.4 mph"
  hasSample: boolean;   // false → no measured data; UI greys it, never invents
  tone: ProfileTone;
  note?: string;        // short qualitative read (e.g. "bounce-back")
  edge?: boolean;       // sourced from an NHL EDGE snapshot
}

export interface MeasuredProfile {
  isSkater: boolean;
  dimensions: ProfileDimension[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const bandPct = (v: number, lo: number, hi: number) =>
  Math.round(clamp((v - lo) / (hi - lo), 0, 1) * 100);
const toneForPct = (pct: number): ProfileTone =>
  pct >= 70 ? "good" : pct >= 40 ? "neutral" : "warn";

export function computeMeasuredProfile(a: Asset): MeasuredProfile {
  if (a.position === "Pick" || a.position === "G") {
    return { isSkater: false, dimensions: [] };
  }
  const isD = a.position === "D";
  const games = a.games ?? 0;
  const hasStatSample = games >= 10;
  const dims: ProfileDimension[] = [];

  // ── Production — pts/82 vs position band ──
  {
    const [lo, hi] = isD ? [8, 55] : [15, 90];
    const pct = bandPct(a.ptsPace ?? 0, lo, hi);
    dims.push({
      key: "production", label: "Production",
      pct, rawLabel: `${(a.ptsPace ?? 0).toFixed(0)} pts/82`,
      hasSample: hasStatSample, tone: toneForPct(pct),
    });
  }

  // ── Opportunity — ice time vs position band ──
  {
    const [lo, hi] = isD ? [15, 25] : [11, 21];
    const toi = a.avgTOI ?? 0;
    const pct = bandPct(toi, lo, hi);
    dims.push({
      key: "opportunity", label: "Ice Time",
      pct, rawLabel: `${toi.toFixed(1)} min`,
      hasSample: hasStatSample && toi > 0, tone: toneForPct(pct),
      note: pct >= 70 ? "top-6 / top-4 role" : pct < 30 ? "sheltered / depth" : undefined,
    });
  }

  // ── Burst — EDGE explosiveness (max of bursts / top speed vs band) ──
  {
    const hasEdge = a.edgeBurstsOver20 != null || a.edgeSpeedMaxMph != null;
    const bursts = a.edgeBurstsOver20 ?? 0;
    const speed = a.edgeSpeedMaxMph ?? 0;
    const pct = Math.max(bandPct(bursts, 5, 45), bandPct(speed, 19, 24));
    const rawLabel = hasEdge
      ? [a.edgeBurstsOver20 != null ? `${bursts} bursts` : null,
         a.edgeSpeedMaxMph != null ? `${speed.toFixed(1)} mph` : null].filter(Boolean).join(" · ")
      : "no EDGE sample";
    dims.push({
      key: "burst", label: "Burst",
      pct: hasEdge ? pct : 0, rawLabel,
      hasSample: hasEdge, tone: hasEdge ? toneForPct(pct) : "none", edge: true,
      note: hasEdge && pct >= 70 ? "explosive — rush threat" : undefined,
    });
  }

  // ── Finishing luck — EDGE high-danger finishing vs league (not skill) ──
  {
    const hd = a.hdFinishingDelta;
    const hasEdge = hd != null;
    // Cold finishing on quality chances is bounce-back fuel (high on this axis);
    // running hot is a cool-off risk (low). Centered so 0 = 50.
    const pct = hasEdge ? Math.round(clamp(0.5 - (hd as number) * 8, 0, 1) * 100) : 50;
    const cold = hasEdge && (hd as number) <= -0.02;
    const hot = hasEdge && (hd as number) >= 0.03;
    dims.push({
      key: "finishing", label: "Finishing Luck",
      pct: hasEdge ? pct : 0,
      rawLabel: hasEdge ? `${(hd as number) > 0 ? "+" : ""}${((hd as number) * 100).toFixed(1)}% vs lg` : "no EDGE sample",
      hasSample: hasEdge, edge: true,
      tone: cold ? "good" : hot ? "warn" : "neutral",
      note: cold ? "bounce-back" : hot ? "running hot" : hasEdge ? "neutral" : undefined,
    });
  }

  // ── Pedigree — draft slot / NHLe (mostly relevant for young players) ──
  {
    const draft = a.draftOverall;
    const nhle = a.prospectPtsPace ?? 0;
    const hasPedigree = (draft != null && draft > 0) || nhle > 0;
    // Higher draft pick (lower number) and stronger NHLe read higher.
    const draftPct = draft != null && draft > 0 ? bandPct(65 - draft, 1, 64) : 0;
    const nhlePct = nhle > 0 ? bandPct(nhle, 20, 70) : 0;
    const pct = Math.max(draftPct, nhlePct);
    const rawLabel = hasPedigree
      ? [draft != null && draft > 0 ? `#${draft} overall` : null,
         nhle > 0 ? `NHLe ${nhle.toFixed(0)}` : null].filter(Boolean).join(" · ")
      : "undrafted / no signal";
    dims.push({
      key: "pedigree", label: "Pedigree",
      pct: hasPedigree ? pct : 0, rawLabel,
      hasSample: hasPedigree, tone: hasPedigree ? toneForPct(pct) : "none",
      note: a.age <= 23 ? undefined : "fades with NHL track record",
    });
  }

  return { isSkater: true, dimensions: dims };
}
