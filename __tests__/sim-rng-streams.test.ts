// ── SIM RNG determinism (audit #2/#3) ────────────────────────────
import { describe, it, expect } from "vitest";
import { scenarioSeed, mulberry32, hashString } from "@/app/lib/sim-engine";

describe("Cup Run seed folds in the year and run seed (audit #3)", () => {
  const base = {
    mode: "cup-run",
    homeTeamId: "WPG",
    partnerTeamId: "",
    trades: [] as unknown[],
  };

  it("gives each season year of a run an independent seed", () => {
    const y1 = scenarioSeed({ ...base, cupRunSeed: 12345, cupRunYear: 1 });
    const y2 = scenarioSeed({ ...base, cupRunSeed: 12345, cupRunYear: 2 });
    const y3 = scenarioSeed({ ...base, cupRunSeed: 12345, cupRunYear: 3 });
    expect(new Set([y1, y2, y3]).size).toBe(3); // no two years collide
  });

  it("gives different runs different seeds even in the same year", () => {
    const runA = scenarioSeed({ ...base, cupRunSeed: 111, cupRunYear: 1 });
    const runB = scenarioSeed({ ...base, cupRunSeed: 222, cupRunYear: 1 });
    expect(runA).not.toBe(runB);
  });

  it("stays reproducible — the same run + year always seeds the same", () => {
    const a = scenarioSeed({ ...base, cupRunSeed: 999, cupRunYear: 2 });
    const b = scenarioSeed({ ...base, cupRunSeed: 999, cupRunYear: 2 });
    expect(a).toBe(b);
  });

  it("leaves an ordinary single-season seed unchanged (no cup fields)", () => {
    const plain1 = scenarioSeed(base);
    const plain2 = scenarioSeed(base);
    expect(plain1).toBe(plain2);
    // Adding cup-run context must change it, so the two paths never collide.
    expect(scenarioSeed({ ...base, cupRunSeed: 1, cupRunYear: 1 })).not.toBe(plain1);
  });
});

describe("named RNG streams are independent (audit #2)", () => {
  it("awards, calder, and playoffs derive distinct streams from one seed", () => {
    const seed = 4242;
    const awards  = mulberry32(seed + hashString("awards"));
    const calder  = mulberry32(seed + hashString("calder"));
    const playoff = mulberry32(seed + hashString("playoffs"));

    // First draw of each stream differs — they are not the same sequence.
    const a = awards(), c = calder(), p = playoff();
    expect(new Set([a, c, p]).size).toBe(3);
  });

  it("the playoff stream is unaffected by how many times awards/calder are drawn", () => {
    const seed = 4242;
    // Two 'universes' that consume the awards/calder streams a different number
    // of times (e.g. one more rookie in the Calder race) …
    const playoffA = mulberry32(seed + hashString("playoffs"));
    const awardsA = mulberry32(seed + hashString("awards"));
    awardsA(); awardsA();

    const playoffB = mulberry32(seed + hashString("playoffs"));
    const awardsB = mulberry32(seed + hashString("awards"));
    awardsB(); awardsB(); awardsB(); awardsB(); awardsB();

    // … still produce the identical playoff sequence.
    expect([playoffA(), playoffA(), playoffA()]).toEqual([playoffB(), playoffB(), playoffB()]);
  });
});
