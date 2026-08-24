import { describe, expect, it } from "vitest";
import {
  startCupRun,
  recordSeason,
  retentionCheck,
  addRetention,
  rollRetentionLedger,
  rollLeagueForward,
  reconcileTeamCapSpaces,
  difficultyForTeam,
  seasonLabelForYear,
  cupRunShareText,
  cupRunOffseasonEntry,
  MAX_RETENTION_SLOTS,
} from "../app/lib/cup-run";
import { generateSyntheticDraftClass } from "../app/lib/synthetic-draft";
import { slotMultiplier, computeChangeOfScenery } from "../app/lib/lineup-context";
import { calcNAV } from "../app/lib/xnav-engine";
import { advanceSeason } from "../app/lib/season-rollover";
import type { Asset, Team } from "../app/lib/trade-types";

const team = (id: string, over: Partial<Team> = {}): Team => ({
  id, name: `Team ${id}`, capSpace: 5, standing: 10, phase: "Bubble", ...over,
});

const asset = (id: string, over: Partial<Asset> = {}): Asset => ({
  id, teamId: "CAR", name: id, position: "C", age: 26, games: 70,
  ptsPace: 50, defRate: 0.1, avgTOI: 17, capHit: 5, yearsRemaining: 3,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0,
  multiplier: 1, contractStatus: "SIGNED", expiresThisOffseason: false,
  hasLiveStats: true, ...over,
});

// ── Difficulty & lifecycle ────────────────────────────────────
describe("cup run lifecycle", () => {
  it("rates contenders easy and rebuilds hard", () => {
    expect(difficultyForTeam({ phase: "Contender", standing: 2 }).stars).toBe(1);
    expect(difficultyForTeam({ phase: "Contender", standing: 8 }).stars).toBe(2);
    expect(difficultyForTeam({ phase: "Bubble", standing: 15 }).stars).toBe(3);
    expect(difficultyForTeam({ phase: "Retooling", standing: 22 }).stars).toBe(4);
    expect(difficultyForTeam({ phase: "Tanking", standing: 32 }).stars).toBe(5);
  });

  it("labels seasons off the configured season", () => {
    expect(seasonLabelForYear(1)).toBe("2026-27");
    expect(seasonLabelForYear(2)).toBe("2027-28");
    expect(seasonLabelForYear(3)).toBe("2028-29");
  });

  it("wins immediately when the run team takes the Cup", () => {
    const run = startCupRun(team("VAN", { phase: "Tanking", standing: 32 }));
    const after = recordSeason(run, { championTeamId: "VAN", championTeamName: "Team VAN", madePlayoffs: true });
    expect(after.status).toBe("WON");
    expect(after.seasons[0].wonCup).toBe(true);
    expect(cupRunShareText(after)).toContain("Won the Cup");
    expect(cupRunShareText(after)).toContain("Year 1");
  });

  it("advances through three seasons then fires the GM", () => {
    let run = startCupRun(team("VAN"));
    run = recordSeason(run, { championTeamId: "CAR", championTeamName: "Canes", madePlayoffs: false });
    expect(run.status).toBe("ACTIVE");
    expect(run.currentYear).toBe(2);
    run = recordSeason(run, { championTeamId: "COL", championTeamName: "Avs", madePlayoffs: true });
    expect(run.currentYear).toBe(3);
    run = recordSeason(run, { championTeamId: "DAL", championTeamName: "Stars", madePlayoffs: true });
    expect(run.status).toBe("FIRED");
    expect(cupRunShareText(run)).toContain("Fired after 3 seasons");
  });

  it("routes later Cup Run offseasons through draft summary, then re-sign fallback", () => {
    const yearOne = startCupRun(team("VAN"));
    const yearTwo = recordSeason(yearOne, { championTeamId: "CAR", championTeamName: "Canes", madePlayoffs: false });
    expect(cupRunOffseasonEntry(yearOne, false)).toBe("DRAFT_NIGHT");
    expect(cupRunOffseasonEntry(yearTwo, true)).toBe("DRAFT_SUMMARY");
    expect(cupRunOffseasonEntry(yearTwo, false)).toBe("RESIGN");
  });
});

// ── Retention ledger ──────────────────────────────────────────
describe("retention ledger", () => {
  const CAP = 100;
  const prop = (id: string, pct: number, capHit: number, years = 2) =>
    ({ playerId: id, playerName: id, pct, capHit, yearsRemaining: years });

  it("rejects retention above 50%", () => {
    expect(retentionCheck([], [prop("a", 0.6, 8)], CAP).ok).toBe(false);
    expect(retentionCheck([], [prop("a", 0.5, 8)], CAP).ok).toBe(true);
  });

  it("enforces the 3-slot limit including active ledger entries", () => {
    let ledger = addRetention([], [prop("a", 0.5, 4), prop("b", 0.5, 4)]);
    expect(retentionCheck(ledger, [prop("c", 0.3, 4)], CAP).ok).toBe(true);
    ledger = addRetention(ledger, [prop("c", 0.3, 4)]);
    expect(ledger).toHaveLength(MAX_RETENTION_SLOTS);
    const fourth = retentionCheck(ledger, [prop("d", 0.2, 2)], CAP);
    expect(fourth.ok).toBe(false);
    expect(fourth.reason).toContain("slots full");
  });

  it("enforces the aggregate 15%-of-cap limit", () => {
    const ledger = addRetention([], [prop("a", 0.5, 14)]); // 7.0 retained
    const over = retentionCheck(ledger, [prop("b", 0.5, 18)], CAP); // +9.0 > 15
    expect(over.ok).toBe(false);
    expect(over.reason).toContain("15%");
    expect(retentionCheck(ledger, [prop("c", 0.5, 12)], CAP).ok).toBe(true); // +6.0 = 13 ok
  });

  it("frees slots as retained terms run out at rollover", () => {
    const ledger = addRetention([], [prop("a", 0.5, 8, 1), prop("b", 0.4, 6, 3)]);
    const rolled = rollRetentionLedger(ledger);
    expect(rolled).toHaveLength(1);
    expect(rolled[0].playerId).toBe("b");
    expect(rolled[0].yearsRemaining).toBe(2);
  });
});

// ── Synthetic draft ───────────────────────────────────────────
describe("synthetic draft classes", () => {
  const order = ["VAN", "SJS", "CHI", "CAR"];

  it("is deterministic per (year, seed) and varies by year", () => {
    const a = generateSyntheticDraftClass(2027, 5, order);
    const b = generateSyntheticDraftClass(2027, 5, order);
    const c = generateSyntheticDraftClass(2028, 5, order);
    expect(a).toEqual(b);
    expect(a.map((p) => p.name)).not.toEqual(c.map((p) => p.name));
  });

  it("produces 32 ELC picks with pedigree-shaped pace decline", () => {
    const cls = generateSyntheticDraftClass(2027, 9, order);
    expect(cls).toHaveLength(32);
    for (const p of cls) {
      expect(p.age).toBe(18);
      expect(p.yearsRemaining).toBe(3);
      expect(p.draftYear).toBe(2027);
      expect(p.games).toBe(0);
    }
    const skaters = cls.filter((p) => p.position !== "G");
    const early = skaters.filter((p) => (p.draftOverall ?? 99) <= 8);
    const late = skaters.filter((p) => (p.draftOverall ?? 0) >= 25);
    const avg = (arr: Asset[]) => arr.reduce((s, p) => s + (p.prospectPtsPace ?? 0), 0) / arr.length;
    expect(avg(early)).toBeGreaterThan(avg(late));
  });

  it("assigns picks in the provided (worst-first) team order", () => {
    const cls = generateSyntheticDraftClass(2027, 9, order);
    expect(cls[0].teamId).toBe("VAN");
    expect(cls[1].teamId).toBe("SJS");
    expect(cls[4].teamId).toBe("VAN"); // wraps
  });
});

// ── Lineup context ────────────────────────────────────────────
describe("lineup context", () => {
  it("weights forward lines and defense pairs downward by slot", () => {
    expect(slotMultiplier(0, "F")).toBeGreaterThan(slotMultiplier(5, "F"));
    expect(slotMultiplier(5, "F")).toBeGreaterThan(slotMultiplier(11, "F"));
    expect(slotMultiplier(0, "D")).toBeGreaterThan(slotMultiplier(4, "D"));
  });

  it("flags a traded player who lands in a better slot", () => {
    // 'buried' is the 7th-best F on a stacked team, then traded to a
    // thin team where he's clearly top six.
    const stacked = Array.from({ length: 8 }, (_, i) =>
      asset(`star${i}`, { teamId: "COL", ptsPace: 90 - i }));
    const buried = asset("buried", { teamId: "COL", ptsPace: 55 });
    const thin = Array.from({ length: 8 }, (_, i) =>
      asset(`thin${i}`, { teamId: "CHI", ptsPace: 40 - i }));

    const prev = [...stacked, buried, ...thin];
    const next = [...stacked, { ...buried, teamId: "CHI" }, ...thin];
    const scenery = computeChangeOfScenery(prev, next);
    expect(scenery.has("buried")).toBe(true);

    // Reverse move — from thin top-line into a bottom-six role — is not scenery.
    const star = { ...thin[0], id: "thinstar", ptsPace: 45 };
    const prev2 = [...stacked, ...thin, star];
    const next2 = [...stacked, ...thin, { ...star, teamId: "COL" }];
    expect(computeChangeOfScenery(prev2, next2).has("thinstar")).toBe(false);
  });
});

// ── League rollover integration ───────────────────────────────
describe("rollLeagueForward", () => {
  const teams = [team("CAR"), team("VAN", { phase: "Tanking", standing: 32 })];

  const league = (): Asset[] => [
    // CAR: full roster
    ...Array.from({ length: 12 }, (_, i) => asset(`car-f${i}`, { position: "W", ptsPace: 55 - i })),
    ...Array.from({ length: 6 }, (_, i) => asset(`car-d${i}`, { position: "D", ptsPace: 35 - i })),
    ...Array.from({ length: 2 }, (_, i) => asset(`car-g${i}`, { position: "G", ptsPace: 0 })),
    // VAN: thin roster with an ancient veteran who will retire
    ...Array.from({ length: 11 }, (_, i) => asset(`van-f${i}`, { teamId: "VAN", position: "W", ptsPace: 40 - i })),
    asset("van-old", { teamId: "VAN", position: "W", age: 44, ptsPace: 12, capHit: 0.9 }),
    ...Array.from({ length: 5 }, (_, i) => asset(`van-d${i}`, { teamId: "VAN", position: "D", ptsPace: 25 - i })),
    asset("van-g0", { teamId: "VAN", position: "G", ptsPace: 0 }),
    // a pick rides along untouched
    asset("pick-1", { teamId: "VAN", position: "Pick", ptsPace: 0, capHit: 0 }),
  ];

  const state = { ...startCupRun(teams[1]), currentYear: 2 as const };

  it("ages the league, drafts rookies, and keeps every team dressable", () => {
    const res = rollLeagueForward({
      players: league(),
      seasonStartPlayers: league(),
      state,
      teams,
      standings: [{ teamId: "CAR", standing: 1 }, { teamId: "VAN", standing: 32 }],
      capCeiling: 100,
    });
    expect(res.retiredCount).toBeGreaterThanOrEqual(1); // van-old is 45 post-aging
    expect(res.rookieCount).toBe(32);
    expect(res.draftedRookies).toHaveLength(32);
    expect(res.players.some((p) => p.id === "pick-1")).toBe(true);
    expect(res.stateDiagnostic.ok).toBe(true);
    expect(res.stateDiagnostic.draftedCount).toBe(32);
    expect(res.transactions.filter((transaction) => transaction.kind === "DRAFTED")).toHaveLength(32);
    expect(res.transactions.some((transaction) => transaction.kind === "RETIRED" && transaction.playerId === "van-old")).toBe(true);

    for (const t of teams) {
      const roster = res.players.filter((p) => p.teamId === t.id && p.position !== "Pick");
      const f = roster.filter((p) => p.position !== "D" && p.position !== "G").length;
      const d = roster.filter((p) => p.position === "D").length;
      const g = roster.filter((p) => p.position === "G").length;
      expect(f).toBeGreaterThanOrEqual(12);
      expect(d).toBeGreaterThanOrEqual(6);
      expect(g).toBeGreaterThanOrEqual(2);
    }
    // VAN (worst) picks first in the synthetic draft
    const first = res.players.find((p) => p.draftOverall === 1 && (p.draftYear ?? 0) > 2026);
    expect(first?.teamId).toBe("VAN");
    // Rolling INTO Year 2 drafts the 2027 class, not 2028 (off-by-one fix).
    expect(res.draftedRookies.every((p) => p.draftYear === 2027)).toBe(true);
  });

  it("flags every run-out contract for FA resolution — including stale 0-year rows", () => {
    const pool = [
      ...league(),
      // Nino case: contract already at 0 years, never flagged, sits on
      // the roster at full cap hit forever without this.
      asset("stale-zero", { teamId: "CAR", position: "W", age: 32, yearsRemaining: 0, capHit: 4 }),
      asset("expiring-kid", { teamId: "CAR", position: "W", age: 22, yearsRemaining: 1 }),
    ];
    const res = rollLeagueForward({
      players: pool,
      seasonStartPlayers: pool,
      state,
      teams,
      capCeiling: 200,
    });
    const stale = res.players.find((p) => p.id === "stale-zero");
    const kid = res.players.find((p) => p.id === "expiring-kid");
    expect(stale?.expiresThisOffseason).toBe(true);
    expect(stale?.contractStatus).toBe("UFA");
    expect(stale?.lastCapHit).toBe(4);
    expect(kid?.expiresThisOffseason).toBe(true);
    expect(kid?.contractStatus).toBe("RFA");
    // signed players untouched
    const signed = res.players.filter((p) => p.yearsRemaining > 0 && p.position !== "Pick");
    expect(signed.every((p) => !p.expiresThisOffseason)).toBe(true);
  });

  it("carries simulated prospect production into the rolled roster before development", () => {
    const pool = [
      ...league(),
      asset("bjork", {
        teamId: "VAN",
        position: "W",
        age: 19,
        games: 0,
        ptsPace: 0,
        baselinePtsPace: 0,
        prospectPtsPace: 42,
        avgTOI: 0,
        hasLiveStats: false,
      }),
    ];
    const res = rollLeagueForward({
      players: pool,
      seasonStartPlayers: pool,
      state,
      teams,
      capCeiling: 200,
      simSkaterSeasons: [{
        playerId: "bjork",
        projectedPts: 31,
        projectedGoals: 6,
        projectedAssists: 25,
        gamesPlayed: 70,
        projectedTOI: 15.8,
      }],
    });

    const bjork = res.players.find((p) => p.id === "bjork")!;
    expect(bjork.games).toBe(70);
    expect(bjork.avgTOI).toBe(15.8);
    expect(bjork.ptsPace).toBeGreaterThan(30);
    expect(bjork.ptsPace).toBeLessThan(36.4); // regressed below the raw 31-in-70 pace
    expect(bjork.baselinePtsPace).toBeGreaterThan(30); // first NHL season establishes an anchor
    expect(bjork.baselinePtsPace).toBeLessThan(36.4);
    expect((bjork.goalsPace ?? 0) + (bjork.assistsPace ?? 0)).toBeCloseTo(bjork.ptsPace, 5);
    expect(bjork.hasLiveStats).toBe(true);
  });

  it("walks an over-cap AI team back under the ceiling", () => {
    const bloated = league().map((p) =>
      p.teamId === "CAR" && p.position !== "Pick" ? { ...p, capHit: 7 } : p
    ); // CAR ≈ $140M committed vs $100M cap
    const res = rollLeagueForward({
      players: bloated,
      seasonStartPlayers: bloated,
      state, // user team is VAN, so CAR is AI-managed
      teams,
      capCeiling: 100,
    });
    const carCommitted = res.players
      .filter((p) => p.teamId === "CAR" && p.position !== "Pick")
      .reduce((s, p) => s + p.capHit * (1 - (p.retainedPct ?? 0)), 0);
    const walked = res.players.filter((p) => p.teamId === "FA_POOL");
    expect(walked.length).toBeGreaterThan(0);
    expect(carCommitted).toBeLessThan(140);
  });

  it("reconciles every team's cap from rolled rosters, including the user (CX5)", () => {
    const reconciled = reconcileTeamCapSpaces(
      [
        team("CAR", { capSpace: -38 }),
        team("VAN", { capSpace: 4 }),
      ],
      [
        asset("car-a", { teamId: "CAR", capHit: 8 }),
        asset("car-b", { teamId: "CAR", capHit: 2, retainedPct: 0.5 }),
        asset("van-a", { teamId: "VAN", capHit: 90 }),
      ],
      100,
      "VAN",
    );
    // CAR (AI): 100 − (8 + 2×0.5) = 91.
    expect(reconciled.find((t) => t.id === "CAR")?.capSpace).toBe(91);
    // VAN (user) is reconciled too now: 100 − 90 = 10 (was frozen at 4).
    expect(reconciled.find((t) => t.id === "VAN")?.capSpace).toBe(10);
  });

  it("subtracts the user's active retained-salary obligations from their cap (CX5)", () => {
    const reconciled = reconcileTeamCapSpaces(
      [team("VAN", { capSpace: 4 })],
      [asset("van-a", { teamId: "VAN", capHit: 80 })],
      100,
      "VAN",
      6, // $6M retained on players traded away — off-roster, must still count
    );
    expect(reconciled.find((t) => t.id === "VAN")?.capSpace).toBe(14); // 100 − 80 − 6
  });
});

// ── X-NAV consistency ─────────────────────────────────────────
// The valuation engine must keep producing sane numbers for every
// player shape the Cup Run creates: rolled veterans, synthetic
// rookies, and depth call-ups.
describe("x-nav consistency through the cup run", () => {
  it("values rolled-over players finitely and keeps the pedigree path for synthetic rookies", () => {
    const rolled = advanceSeason(
      [
        asset("vet", { age: 31, ptsPace: 72, baselinePtsPace: 70 } as Partial<Asset>),
        asset("kid", { age: 21, ptsPace: 45 }),
      ],
      { seed: 3, year: 2027 },
    );
    for (const p of rolled.players) {
      const nav = calcNAV(p as Parameters<typeof calcNAV>[0]);
      expect(Number.isFinite(nav.total)).toBe(true);
      expect(nav.total).toBeGreaterThan(0);
    }

    const rookies = generateSyntheticDraftClass(2027, 3, ["VAN", "CAR"]);
    const top = calcNAV(rookies[0] as Parameters<typeof calcNAV>[0]);
    const late = calcNAV(rookies[30] as Parameters<typeof calcNAV>[0]);
    expect(Number.isFinite(top.total)).toBe(true);
    expect(top.total).toBeGreaterThan(late.total); // pedigree ordering holds
  });

  it("does not change X-NAV for an untouched asset shape (engine stays consistent)", () => {
    const before = calcNAV(asset("control") as Parameters<typeof calcNAV>[0]);
    // Same asset run through a rollover with a seed that produces no
    // breakout/regression event still values within the aging band.
    const after = advanceSeason([asset("control")], { seed: 1, year: 2027 });
    const navAfter = calcNAV(after.players[0] as Parameters<typeof calcNAV>[0]);
    expect(Number.isFinite(before.total)).toBe(true);
    expect(Number.isFinite(navAfter.total)).toBe(true);
    // one year of aging at 26→27 should not swing value wildly
    expect(Math.abs(navAfter.total - before.total) / before.total).toBeLessThan(0.5);
  });
});

describe("curated future classes", () => {
  it("drafts the best curated prospects first regardless of file order", async () => {
    const { FUTURE_DRAFT_CLASSES } = await import("../app/data/future-draft-classes");
    const cls2027 = generateSyntheticDraftClass(2027, 5, ["VAN", "SJS"]);
    const curated = FUTURE_DRAFT_CLASSES[2027] ?? [];
    if (curated.length >= 32) {
      const bestPace = Math.max(...curated.map((p) => p.nhlePace ?? 0));
      // pick 1 carries the strongest curated NHLe, not whoever was listed 10th alphabetically
      expect(cls2027[0].prospectPtsPace ?? 0).toBeGreaterThanOrEqual(bestPace - 0.01);
      // every first-rounder is a real curated name (no synthetic filler needed)
      const names = new Set(curated.map((p) => p.name));
      expect(cls2027.every((p) => names.has(p.name))).toBe(true);
    }
  });
});

// ── Cap escalation — the ceiling rises with each Cup Run year ──
import { capForCupYear, CAP_BY_CUP_YEAR } from "../app/lib/season-config";

describe("Cup Run cap escalation", () => {
  it("steps the ceiling up each year to the real announced numbers", () => {
    expect(capForCupYear(1).ceiling).toBe(104.0);
    expect(capForCupYear(2).ceiling).toBe(113.5);
    expect(capForCupYear(3).ceiling).toBe(123.0);
    // Floor rises too (2027-28 onward).
    expect(capForCupYear(2).floor).toBe(83.9);
  });

  it("holds the last known ceiling past year 3 instead of collapsing", () => {
    expect(capForCupYear(4).ceiling).toBe(CAP_BY_CUP_YEAR[3].ceiling);
    expect(capForCupYear(99).ceiling).toBe(123.0);
  });

  it("gives a fully-committed team positive space once the cap rises", () => {
    // A team at ~$109M is illegal against the $104M year-1 cap but legal
    // against the $113.5M year-2 cap — the bug that showed teams -5.5M over.
    const roster = Array.from({ length: 20 }, (_, i) =>
      asset(`x${i}`, { teamId: "CAR", capHit: 109 / 20 }));
    const y1 = reconcileTeamCapSpaces(
      [team("CAR")], roster, capForCupYear(1).ceiling, "VAN");
    const y2 = reconcileTeamCapSpaces(
      [team("CAR")], roster, capForCupYear(2).ceiling, "VAN");
    expect(y1[0].capSpace).toBeLessThan(0);
    expect(y2[0].capSpace).toBeGreaterThan(0);
  });
});
