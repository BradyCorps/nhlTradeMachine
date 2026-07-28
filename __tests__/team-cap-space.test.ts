// ── One cap-space calculation, not two ───────────────────────────
// /api/league and /api/league/teams disagreed by exactly $8.5M for all 32
// clubs — Winnipeg $5.0M in Team Analytics and $13.5M in the Trade Machine.
// 8.5 is 104.0 − 95.5: one route rebased the curated figures onto the live
// ceiling and the other did not.
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { resolveTeamCapSpace, CURATED_CAPSPACE_CEILING } from "@/app/lib/team-cap-space";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("resolveTeamCapSpace", () => {
  it("rebases a curated figure onto the live ceiling", () => {
    // Winnipeg: curated $5.0M under a $95.5M ceiling is $13.5M under $104M.
    expect(resolveTeamCapSpace({ curatedCapSpace: 5.0, capCeiling: 104 })).toBe(13.5);
  });

  it("carries a club that is over the cap", () => {
    // Colorado: −$1.9M curated becomes +$6.6M, not a different sign of nothing.
    expect(resolveTeamCapSpace({ curatedCapSpace: -1.9, capCeiling: 104 })).toBe(6.6);
  });

  it("is the identity at the curated ceiling", () => {
    expect(resolveTeamCapSpace({ curatedCapSpace: 5.0, capCeiling: CURATED_CAPSPACE_CEILING })).toBe(5.0);
  });

  it("never rebases a live figure — that would double-count the delta", () => {
    // A scraped value is already measured against the current ceiling.
    expect(resolveTeamCapSpace({ curatedCapSpace: 5.0, capCeiling: 104, liveCapSpace: 2.2 })).toBe(2.2);
  });

  it("falls back when the live figure is missing or unusable", () => {
    for (const live of [null, undefined, NaN, Infinity]) {
      expect(resolveTeamCapSpace({ curatedCapSpace: 5.0, capCeiling: 104, liveCapSpace: live as number }))
        .toBe(13.5);
    }
  });

  it("rounds to the tenth the rest of the app displays", () => {
    expect(resolveTeamCapSpace({ curatedCapSpace: 1.234, capCeiling: 95.5 })).toBe(1.2);
  });
});

describe("both league routes use it", () => {
  it("leaves no second copy of the ceiling delta", () => {
    for (const route of ["app/api/league/route.ts", "app/api/league/teams/route.ts"]) {
      const src = read(route);
      expect(src, route).toContain("resolveTeamCapSpace");
      // The local constant was the whole bug.
      expect(src, route).not.toMatch(/const CURATED_CAPSPACE_CEILING\s*=/);
    }
  });
});
