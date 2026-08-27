import { describe, expect, it } from "vitest";
import {
  buildDomainManifest,
  buildReleaseManifest,
  failedDomains,
  manifestCacheKey,
  manifestIsPublishable,
} from "@/app/lib/release-manifest";
import type { GateResult } from "@/app/lib/release-gates";

const pass = (gate: string): GateResult => ({ gate, passed: true, detail: "ok" });
const fail = (gate: string, detail = "broken"): GateResult => ({ gate, passed: false, detail });

describe("buildDomainManifest", () => {
  it("is live when every gate passed and there are no warnings", () => {
    const d = buildDomainManifest({
      domain: "roster", lastSuccessfulIngest: "2026-08-27T09:00:00Z",
      coverage: "1543/1543 players", modelVersion: "X-NAV 4.2",
      gates: [pass("a"), pass("b")],
    });
    expect(d.status).toBe("live");
  });

  it("is down when any gate failed, regardless of how many passed", () => {
    const d = buildDomainManifest({
      domain: "contracts", lastSuccessfulIngest: "2026-08-27T09:00:00Z",
      coverage: "1543 records", modelVersion: "X-NAV 4.2",
      gates: [pass("a"), fail("b", "Korchinski age 18")],
    });
    expect(d.status).toBe("down");
  });

  it("is degraded, not live, when no gates ran at all — unverified is not the same as healthy", () => {
    const d = buildDomainManifest({
      domain: "fantasy", lastSuccessfulIngest: null,
      coverage: "unknown", modelVersion: "X-NAV 4.2",
      gates: [],
    });
    expect(d.status).toBe("degraded");
    expect(d.warnings.some((w) => w.includes("unverified"))).toBe(true);
  });

  it("is degraded when gates pass but an explicit warning still applies", () => {
    const d = buildDomainManifest({
      domain: "stats", lastSuccessfulIngest: "2026-08-20T09:00:00Z",
      coverage: "partial", modelVersion: "X-NAV 4.2",
      gates: [pass("a")], warnings: ["Ingest is 7 days stale"],
    });
    expect(d.status).toBe("degraded");
  });
});

describe("buildReleaseManifest / diagnosability", () => {
  it("a failed domain does not mark the whole manifest unpublishable if others are live", () => {
    const roster = buildDomainManifest({
      domain: "roster", lastSuccessfulIngest: "2026-08-27T09:00:00Z",
      coverage: "ok", modelVersion: "X-NAV 4.2", gates: [pass("a")],
    });
    const fantasy = buildDomainManifest({
      domain: "fantasy", lastSuccessfulIngest: "2026-08-27T09:00:00Z",
      coverage: "ok", modelVersion: "X-NAV 4.2", gates: [fail("b", "stale projection")],
    });
    const manifest = buildReleaseManifest("2026-08-27", "X-NAV 4.2", [roster, fantasy]);

    // The whole product is not blanket-marked Live or Down — each domain is
    // independently inspectable, which is the acceptance line this exists for.
    expect(manifest.domains.roster?.status).toBe("live");
    expect(manifest.domains.fantasy?.status).toBe("down");
    expect(failedDomains(manifest)).toEqual(["fantasy"]);
    expect(manifestIsPublishable(manifest)).toBe(false);
  });

  it("is publishable once every reported domain is at least degraded, not down", () => {
    const roster = buildDomainManifest({
      domain: "roster", lastSuccessfulIngest: "2026-08-27T09:00:00Z",
      coverage: "ok", modelVersion: "X-NAV 4.2", gates: [pass("a")],
    });
    const manifest = buildReleaseManifest("2026-08-27", "X-NAV 4.2", [roster]);
    expect(manifestIsPublishable(manifest)).toBe(true);
    expect(failedDomains(manifest)).toEqual([]);
  });
});

describe("manifestCacheKey", () => {
  it("changes when the snapshot date changes", () => {
    const a = manifestCacheKey("cache:league:analytics:v1", "2026-08-27", "X-NAV 4.2");
    const b = manifestCacheKey("cache:league:analytics:v1", "2026-08-28", "X-NAV 4.2");
    expect(a).not.toBe(b);
  });

  it("changes when the model version changes — the DATA-06 acceptance line", () => {
    const a = manifestCacheKey("cache:league:analytics:v1", "2026-08-27", "X-NAV 4.2");
    const b = manifestCacheKey("cache:league:analytics:v1", "2026-08-27", "X-NAV 4.3");
    expect(a).not.toBe(b);
  });

  it("is stable for the same base/date/version — a cache hit, not a cache stampede", () => {
    const a = manifestCacheKey("cache:league:analytics:v1", "2026-08-27", "X-NAV 4.2");
    const b = manifestCacheKey("cache:league:analytics:v1", "2026-08-27", "X-NAV 4.2");
    expect(a).toBe(b);
  });

  it("normalizes the model version so a spacing/casing change alone doesn't fragment the key", () => {
    const a = manifestCacheKey("base", "2026-08-27", "X-NAV 4.2");
    const b = manifestCacheKey("base", "2026-08-27", "x-nav   4.2");
    expect(a).toBe(b);
  });
});
