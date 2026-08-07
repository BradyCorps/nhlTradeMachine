import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  GRAVITY_V3_CALCULATION_MINIMUM_GAMES,
  GRAVITY_V3_MINIMUM_PERCENTILE_POPULATION,
  GRAVITY_V3_PUBLIC_MINIMUM_COVERAGE,
  GRAVITY_V3_PUBLIC_MINIMUM_GAMES,
  computeGravity,
  type GravityPositionGroup,
  type GravityTier,
} from "../../app/lib/gravity";
import type { Asset } from "../../app/lib/trade-types";
import type { PopulationRecord } from "./core";

const ROOT = process.cwd();
const CALIBRATION_DIR = path.join(ROOT, "data", "gravity-calibration", "2025-26");
const POPULATION_PATH = path.join(CALIBRATION_DIR, "population.json");
const MANIFEST_PATH = path.join(CALIBRATION_DIR, "manifest.json");
const OUTPUT_PATH = path.join(CALIBRATION_DIR, "tier-calibration.json");

interface PopulationFile {
  generatedAt: string;
  modelRelease: string;
  records: PopulationRecord[];
}

interface ManifestFile {
  artifacts: { populationSha256: string };
  manifestPayloadSha256: string;
  season: string;
}

type TierThresholds = {
  supermassiveAtOrAbove: number;
  starAtOrAbove: number;
  mainSequenceAtOrAbove: number;
  satelliteAtOrAbove: number;
  blackHoleBelow: number;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const r2 = (value: number): number => Math.round(value * 100) / 100;

function percentile(values: number[], target: number): number {
  if (values.length === 0) throw new Error("Cannot calibrate an empty position group");
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((target / 100) * (sorted.length - 1))),
  );
  return sorted[index];
}

function thresholdsFor(forces: number[]): TierThresholds {
  return {
    supermassiveAtOrAbove: r2(percentile(forces, 98)),
    starAtOrAbove: r2(percentile(forces, 92)),
    mainSequenceAtOrAbove: r2(percentile(forces, 80)),
    satelliteAtOrAbove: r2(percentile(forces, 60)),
    blackHoleBelow: r2(percentile(forces, 3)),
  };
}

function tierFor(force: number, thresholds: TierThresholds): GravityTier {
  if (force >= thresholds.supermassiveAtOrAbove) return "SUPERMASSIVE";
  if (force >= thresholds.starAtOrAbove) return "STAR";
  if (force >= thresholds.mainSequenceAtOrAbove) return "MAIN_SEQUENCE";
  if (force >= thresholds.satelliteAtOrAbove) return "SATELLITE";
  if (force >= thresholds.blackHoleBelow) return "ASTEROID";
  return "BLACK_HOLE";
}

function assetFor(record: PopulationRecord): Asset {
  if (!record.position) throw new Error(`Qualified record ${record.playerId} has no position`);
  return {
    ...record.inputs,
    id: String(record.playerId),
    name: record.playerName,
    teamId: record.teamHistory[0] ?? "",
    position: record.position,
    age: 0,
    capHit: 0,
    yearsRemaining: 0,
    hasNMC: false,
    hasNTC: false,
    canRetain: false,
    retainedPct: 0,
    multiplier: 1,
  } as Asset;
}

function main(): void {
  const populationText = fs.readFileSync(POPULATION_PATH, "utf8");
  const population = JSON.parse(populationText) as PopulationFile;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as ManifestFile;
  const populationHash = sha256(populationText);
  if (populationHash !== manifest.artifacts.populationSha256) {
    throw new Error("Frozen Gravity population does not match the committed manifest hash");
  }

  const groups: Record<GravityPositionGroup, number[]> = { F: [], D: [] };
  for (const record of population.records) {
    if (!record.qualification.publicTierEligible) continue;
    const profile = computeGravity(assetFor(record));
    if (!profile || profile.evidenceStatus !== "QUALIFIED") continue;
    groups[record.position === "D" ? "D" : "F"].push(profile.force);
  }

  const positions = Object.fromEntries(
    (["F", "D"] as const).map((group) => {
      const thresholds = thresholdsFor(groups[group]);
      const observedTierCounts: Record<GravityTier, number> = {
        SUPERMASSIVE: 0,
        STAR: 0,
        MAIN_SEQUENCE: 0,
        SATELLITE: 0,
        ASTEROID: 0,
        BLACK_HOLE: 0,
      };
      for (const force of groups[group]) observedTierCounts[tierFor(force, thresholds)] += 1;
      return [group, {
        qualifiedPlayers: groups[group].length,
        thresholds,
        observedTierCounts,
      }];
    }),
  );

  const artifact = {
    schemaVersion: "gravity-v3-tier-calibration-v1",
    modelRelease: population.modelRelease,
    season: manifest.season,
    source: {
      generatedAt: population.generatedAt,
      populationSha256: populationHash,
      manifestPayloadSha256: manifest.manifestPayloadSha256,
    },
    evidencePolicy: {
      calculationMinimumGames: GRAVITY_V3_CALCULATION_MINIMUM_GAMES,
      publicMinimumGames: GRAVITY_V3_PUBLIC_MINIMUM_GAMES,
      publicMinimumCoverage: GRAVITY_V3_PUBLIC_MINIMUM_COVERAGE,
      minimumPositionPercentilePopulation: GRAVITY_V3_MINIMUM_PERCENTILE_POPULATION,
    },
    percentileScope: "WITHIN_POSITION",
    tierAnchors: {
      supermassiveAtOrAbovePercentile: 98,
      starAtOrAbovePercentile: 92,
      mainSequenceAtOrAbovePercentile: 80,
      satelliteAtOrAbovePercentile: 60,
      blackHoleBelowPercentile: 3,
    },
    positions,
  };
  const output = `${JSON.stringify(artifact, null, 2)}\n`;

  if (process.argv.includes("--check")) {
    const committed = fs.readFileSync(OUTPUT_PATH, "utf8");
    if (committed !== output) {
      throw new Error("Committed Gravity tier calibration is stale; rerun with --write");
    }
    console.log("Gravity tier calibration matches the verified frozen population.");
    return;
  }
  if (process.argv.includes("--write")) {
    fs.writeFileSync(OUTPUT_PATH, output, "utf8");
    console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
    return;
  }
  process.stdout.write(output);
}

main();
