import { describe, expect, it } from "vitest";
import { leagueTeamCacheKey, teamCacheKey } from "@/app/lib/team-cache";
import { XNAV_MODEL_VERSION } from "@/app/lib/data-context";
import { snapshotDate } from "@/app/lib/valuation-snapshot";

// DATA-06: "all downstream caches invalidate by snapshotDate + modelVersion."
// Proves the real wiring, not just the underlying manifestCacheKey helper in
// isolation — these are the two cache-key builders every hot league/team
// route actually calls.
describe("team-cache keys carry the release manifest's snapshotDate + modelVersion", () => {
  const modelSlug = XNAV_MODEL_VERSION.replace(/\s+/g, "-").toLowerCase();
  const today = snapshotDate();

  it("teamCacheKey embeds today's snapshot date and the current model version", () => {
    const key = teamCacheKey(104);
    expect(key).toContain(`:snap:${today}:`);
    expect(key).toContain(`:model:${modelSlug}`);
  });

  it("leagueTeamCacheKey embeds today's snapshot date and the current model version", () => {
    const key = leagueTeamCacheKey(104);
    expect(key).toContain(`:snap:${today}:`);
    expect(key).toContain(`:model:${modelSlug}`);
  });

  it("different cap ceilings still produce different keys under the same snapshot/model", () => {
    expect(teamCacheKey(104)).not.toBe(teamCacheKey(95.5));
  });
});
