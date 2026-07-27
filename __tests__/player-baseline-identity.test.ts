import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  baselineForNhlPlayerId,
  type PlayerBaselineMap,
} from "@/app/lib/player-baselines";
import sourceManifest from "@/scripts/moneypuck-baseline-sources.json";

const ROOT = process.cwd();
const ARTIFACT_PATH = path.join(ROOT, sourceManifest.runtimeArtifact.path);

const loadArtifact = (): PlayerBaselineMap =>
  JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8")) as PlayerBaselineMap;

describe("MoneyPuck baseline identity", () => {
  it("selects only the deterministic, fingerprinted source manifest", () => {
    const sources = [
      ...sourceManifest.moneyPuckSeasons.flatMap((season) => [
        season.skaters,
        season.goalies,
      ]),
      sourceManifest.naturalStatTrickBuckets.current.skaters,
      sourceManifest.naturalStatTrickBuckets.current.pairings,
      sourceManifest.naturalStatTrickBuckets.prior.skaters,
      sourceManifest.naturalStatTrickBuckets.prior.pairings,
    ];

    expect(sources.map((source) => source.path).sort()).toEqual([
      "MoneyPuckData/2022_23/goalies(3).csv",
      "MoneyPuckData/2022_23/skaters(3).csv",
      "MoneyPuckData/2023_24/goalies(2).csv",
      "MoneyPuckData/2023_24/skaters(2).csv",
      "MoneyPuckData/2024_25/goalies(1).csv",
      "MoneyPuckData/2024_25/skaters(1).csv",
      "MoneyPuckData/2025_26/goalies.csv",
      "MoneyPuckData/2025_26/skaters.csv",
      "OtherData/2022;23;24;25_defensive_pairings_all.csv",
      "OtherData/2022;23;24;25_skater_totals_all.csv",
      "OtherData/2025;26_defensive_pairings_all.csv",
      "OtherData/2025;26_skater_totals_all.csv",
    ]);
    expect(new Set(sources.map((source) => source.path)).size).toBe(12);
    expect(sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);

    const builder = fs.readFileSync(
      path.join(ROOT, "scripts/process-moneypuck-baselines.ts"),
      "utf8",
    );
    expect(builder).toContain("moneypuck-baseline-sources.json");
    expect(builder).not.toContain("readdirSync");
  });

  it("stores every baseline under its matching numeric NHL player ID", () => {
    const baselines = loadArtifact();
    const entries = Object.entries(baselines);

    expect(entries).toHaveLength(1206);
    expect(entries.every(([playerId, baseline]) =>
      /^\d+$/.test(playerId)
      && baseline.playerId === Number(playerId))).toBe(true);
  });

  it("keeps same-name NHL players as distinct baseline records", () => {
    const baselines = loadArtifact();
    const idsFor = (name: string) => Object.values(baselines)
      .filter((baseline) => baseline.name === name)
      .map((baseline) => baseline.playerId)
      .sort((a, b) => a - b);

    expect(idsFor("Sebastian Aho")).toEqual([8478427, 8480222]);
    expect(idsFor("Elias Pettersson")).toEqual([8480012, 8483678]);
  });

  it("looks up by NHL player ID without a name-key fallback", () => {
    const baselines: PlayerBaselineMap = {
      "8478427": {
        playerId: 8478427,
        name: "Sebastian Aho",
        baselineXgRel: 0.12,
      },
      "8480222": {
        playerId: 8480222,
        name: "Sebastian Aho",
        baselineXgRel: -0.04,
      },
    };

    expect(baselineForNhlPlayerId(baselines, "8478427").baselineXgRel).toBe(0.12);
    expect(baselineForNhlPlayerId(baselines, 8480222).baselineXgRel).toBe(-0.04);
    expect(baselineForNhlPlayerId(baselines, "sebastianaho")).toEqual({});
    expect(baselineForNhlPlayerId({
      "8478427": { ...baselines["8478427"], playerId: 8480222 },
    }, "8478427")).toEqual({});
  });

  it("preserves the authorized artifact's existing goalie enrichments", () => {
    const baselines = Object.values(loadArtifact());

    expect(baselines.filter((baseline) => baseline.baselineHdsvPct != null)).toHaveLength(109);
    expect(baselines.filter((baseline) => baseline.baselineGsaaPerGame != null)).toHaveLength(109);
  });
});
