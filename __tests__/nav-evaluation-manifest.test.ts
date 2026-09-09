import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditManifest, type EvaluationManifest } from "../scripts/backtest/nav-evaluation-manifest";

function fixture(): EvaluationManifest {
  const manifest = JSON.parse(readFileSync("docs/analytics/nav01-evaluation-manifest.json", "utf8")) as EvaluationManifest;
  for (const source of manifest.sources) {
    source.sha256 = createHash("sha256").update("fixture").digest("hex");
  }
  return manifest;
}
const readFixture = () => Buffer.from("fixture");

describe("NAV-01 development data freeze", () => {
  it("separates valid source integrity from calibration readiness", () => {
    const report = auditManifest(fixture(), readFixture);
    expect(report.integrity).toBe("pass");
    expect(report.verifiedSources).toBe(8);
    expect(report.calibrationReady).toBe(false);
    expect(report.unresolvedEvaluationFields).toContain("independentHoldout");
    expect(report.unresolvedEvaluationFields).toContain("numericalThresholds");
  });
  it("rejects source drift and missing files", () => {
    expect(auditManifest(fixture(), () => Buffer.from("changed")).integrity).toBe("fail");
    expect(auditManifest(fixture(), () => { throw new Error("missing"); }).integrity).toBe("fail");
  });
  it("rejects relabelling inspected data as a holdout", () => {
    const manifest = fixture();
    manifest.sources[0].exposure = "untouched";
    expect(auditManifest(manifest, readFixture).integrity).toBe("fail");
  });
  it("does not read arbitrary paths or accept duplicate sources", () => {
    const manifest = fixture();
    manifest.sources[0].path = "outside-allowlist.csv";
    const reads: string[] = [];
    expect(auditManifest(manifest, file => { reads.push(file); return readFixture(); }).integrity).toBe("fail");
    expect(reads).not.toContain("outside-allowlist.csv");
    manifest.sources[0] = { ...manifest.sources[1] };
    expect(auditManifest(manifest, readFixture).integrity).toBe("fail");
  });
  it("cannot authorize activation by setting a flag or filling placeholders", () => {
    const manifest = fixture();
    for (const key of Object.keys(manifest.evaluation)) manifest.evaluation[key] = "unreviewed";
    expect(auditManifest(manifest, readFixture).calibrationReady).toBe(false);
    manifest.releaseReady = true;
    expect(auditManifest(manifest, readFixture).integrity).toBe("fail");
  });
});
