/** NAV-01 data integrity audit; --gate exits 2 for an intact but blocked protocol. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE_PATHS = [
  "MoneyPuckData/2022_23/skaters(3).csv",
  "MoneyPuckData/2022_23/goalies(3).csv",
  "MoneyPuckData/2023_24/skaters(2).csv",
  "MoneyPuckData/2023_24/goalies(2).csv",
  "MoneyPuckData/2024_25/skaters(1).csv",
  "MoneyPuckData/2024_25/goalies(1).csv",
  "MoneyPuckData/2025_26/skaters.csv",
  "MoneyPuckData/2025_26/goalies.csv",
] as const;

const REQUIRED_EVALUATION = [
  "independentHoldout", "commonUnit", "referenceLevel", "timeHorizon",
  "onIceTarget", "economicTarget", "featureDerivationsAndMissingness",
  "eligibilityAndExclusions", "primaryMetrics", "minimumSamples",
  "uncertaintyMethod", "numericalThresholds",
] as const;

interface Source {
  path: string;
  season: number;
  sha256: string;
  exposure: string;
}

export interface EvaluationManifest {
  schemaVersion: number;
  kind: string;
  baselineRevision: string;
  sources: Source[];
  evaluation: Record<string, unknown>;
  releaseReady: boolean;
}

export function auditManifest(
  manifest: EvaluationManifest,
  readSource: (file: string) => Buffer = readFileSync,
) {
  const errors: string[] = [];
  const verified: string[] = [];
  if (manifest.schemaVersion !== 1 || manifest.kind !== "nav01-development-data-freeze") {
    errors.push("Unsupported manifest schema/kind");
  }
  if (!/^[a-f0-9]{40}$/.test(manifest.baselineRevision)) errors.push("Invalid baseline revision");
  if (manifest.releaseReady !== false) errors.push("A development freeze cannot authorize release");
  if (manifest.sources.length !== SOURCE_PATHS.length) errors.push("Expected exactly eight sources");
  for (const [index, expectedPath] of SOURCE_PATHS.entries()) {
    const matches = manifest.sources.filter(source => source.path === expectedPath);
    if (matches.length !== 1) {
      errors.push(`Expected one source: ${expectedPath}`);
      continue;
    }
    const source = matches[0];
    if (source.season !== 2022 + Math.floor(index / 2)) errors.push(`Season mismatch: ${expectedPath}`);
    if (source.exposure !== "development") errors.push(`Previously inspected source cannot be a new holdout: ${expectedPath}`);
    try {
      // Explicit allowlist: never discover files in ignored directories or read a manifest-supplied arbitrary path.
      const digest = createHash("sha256").update(readSource(expectedPath)).digest("hex");
      if (digest !== source.sha256) errors.push(`Checksum mismatch: ${expectedPath}`);
      else verified.push(expectedPath);
    } catch {
      errors.push(`Source unavailable: ${expectedPath}`);
    }
  }
  const blockers = REQUIRED_EVALUATION.filter(key => manifest.evaluation[key] == null);
  return {
    integrity: errors.length === 0 ? "pass" : "fail",
    verifiedSources: verified.length,
    errors,
    unresolvedEvaluationFields: blockers,
    calibrationReady: false,
    reason: "Version 1 freezes exposed development data only; a reviewed evaluation protocol and independent evidence are still required.",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/backtest/nav-evaluation-manifest.ts")) {
  try {
    const manifest = JSON.parse(readFileSync("docs/analytics/nav01-evaluation-manifest.json", "utf8")) as EvaluationManifest;
    const report = auditManifest(manifest);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.integrity === "fail" ? 1 : process.argv.includes("--gate") ? 2 : 0;
  } catch (error) {
    console.error(`Manifest audit failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
