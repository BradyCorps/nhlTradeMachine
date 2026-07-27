// ── Gravity v4 — shift/stint reconstruction ──────────────────────
// Synthetic fixtures: the reconstruction is verified without network access.
import { describe, expect, it } from "vitest";
import {
  parseClock,
  parseShifts,
  buildStints,
  parseSituationCode,
  findStintAt,
  buildCoverageReport,
  forwardCombinationToi,
  parseLineLabel,
  type RawShiftRow,
  type RosterSpot,
} from "@/scripts/gravity-v4/core";

const HOME = 10, AWAY = 20;

// 5 home skaters + G, 5 away skaters + G
const roster: RosterSpot[] = [
  ...[1, 2, 3].map(id => ({ playerId: id, teamId: HOME, positionCode: "C" as const, fullName: `H F${id}` })),
  ...[4, 5].map(id => ({ playerId: id, teamId: HOME, positionCode: "D" as const, fullName: `H D${id}` })),
  { playerId: 6, teamId: HOME, positionCode: "G" as const, fullName: "H G" },
  ...[11, 12, 13].map(id => ({ playerId: id, teamId: AWAY, positionCode: "L" as const, fullName: `A F${id}` })),
  ...[14, 15].map(id => ({ playerId: id, teamId: AWAY, positionCode: "D" as const, fullName: `A D${id}` })),
  { playerId: 16, teamId: AWAY, positionCode: "G" as const, fullName: "A G" },
  // a 4th home forward who swaps in mid-period
  { playerId: 7, teamId: HOME, positionCode: "C" as const, fullName: "H F7" },
];

const row = (playerId: number, teamId: number, start: string, end: string, period = 1): RawShiftRow =>
  ({ playerId, teamId, period, startTime: start, endTime: end, typeCode: 517 });

describe("parseClock", () => {
  it("parses MM:SS and rejects garbage", () => {
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("12:34")).toBe(754);
    expect(parseClock("20:00")).toBe(1200);
    expect(parseClock(null)).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(parseClock("12:60")).toBeNull(); // invalid seconds
    expect(parseClock("nonsense")).toBeNull();
  });
});

describe("parseShifts", () => {
  it("keeps shift rows and classifies the rest", () => {
    const rows: RawShiftRow[] = [
      row(1, HOME, "00:00", "00:45"),
      { ...row(1, HOME, "00:00", "00:45"), }, // exact duplicate
      { ...row(2, HOME, "00:00", "00:45"), typeCode: 505 }, // goal event row
      row(3, HOME, "00:45", "00:45"), // zero length
      { ...row(4, HOME, "bad", "00:45") }, // unparseable
    ];
    const { shifts, report } = parseShifts(rows);
    expect(shifts).toHaveLength(1);
    expect(report.nonShiftRows).toBe(1);
    expect(report.duplicateRows).toBe(1);
    expect(report.invalidRows).toBe(2);
  });

  it("counts rows for players missing from the roster", () => {
    const known = new Set([1]);
    const { shifts, report } = parseShifts([row(1, HOME, "00:00", "01:00"), row(99, HOME, "00:00", "01:00")], known);
    expect(shifts).toHaveLength(1);
    expect(report.unknownPlayerRows).toBe(1);
  });
});

describe("buildStints", () => {
  // Everyone on 0:00–1:00. At 0:30 home F3 leaves and F7 comes on.
  const rows: RawShiftRow[] = [
    ...[1, 2].map(id => row(id, HOME, "00:00", "01:00")),
    ...[4, 5, 6].map(id => row(id, HOME, "00:00", "01:00")),
    row(3, HOME, "00:00", "00:30"),
    row(7, HOME, "00:30", "01:00"),
    ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
  ];

  it("splits at every change point and tiles the period with no gap", () => {
    const { shifts } = parseShifts(rows);
    const stints = buildStints(shifts, roster, HOME);
    expect(stints).toHaveLength(2);
    expect(stints[0]).toMatchObject({ startSec: 0, endSec: 30, durationSec: 30 });
    expect(stints[1]).toMatchObject({ startSec: 30, endSec: 60, durationSec: 30 });
    expect(stints.reduce((s, x) => s + x.durationSec, 0)).toBe(60);
  });

  it("resolves the on-ice set correctly on each side of the change", () => {
    const { shifts } = parseShifts(rows);
    const [first, second] = buildStints(shifts, roster, HOME);
    expect(first.homeSkaters).toEqual([1, 2, 3, 4, 5]);
    expect(second.homeSkaters).toEqual([1, 2, 4, 5, 7]); // F3 off, F7 on
    expect(first.awaySkaters).toEqual([11, 12, 13, 14, 15]);
  });

  it("separates goalies from skaters and flags true 5v5", () => {
    const { shifts } = parseShifts(rows);
    const [first] = buildStints(shifts, roster, HOME);
    expect(first.homeGoalie).toBe(6);
    expect(first.awayGoalie).toBe(16);
    expect(first.homeSkaters).not.toContain(6);
    expect(first.strength).toBe("5v5");
    expect(first.isEven5v5).toBe(true);
  });

  it("labels a power play as <away>v<home> and not even strength", () => {
    // Home player 3 sits; home is short-handed 4v5 against the away side.
    const pp = rows.filter(r => r.playerId !== 3 && r.playerId !== 7);
    const { shifts } = parseShifts(pp);
    const stints = buildStints(shifts, roster, HOME);
    expect(stints).toHaveLength(1);
    expect(stints[0].strength).toBe("5v4");
    expect(stints[0].isEven5v5).toBe(false);
  });

  it("keeps periods independent", () => {
    const two: RawShiftRow[] = [
      ...[1, 2, 3, 4, 5, 6].map(id => row(id, HOME, "00:00", "01:00", 1)),
      ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00", 1)),
      ...[1, 2, 3, 4, 5, 6].map(id => row(id, HOME, "00:00", "00:30", 2)),
      ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "00:30", 2)),
    ];
    const { shifts } = parseShifts(two);
    const stints = buildStints(shifts, roster, HOME);
    expect(stints.map(s => s.period)).toEqual([1, 2]);
    expect(stints[1].durationSec).toBe(30);
  });
});

describe("situationCode cross-check", () => {
  it("decodes away-goalie / away-skaters / home-skaters / home-goalie", () => {
    expect(parseSituationCode("1551")).toEqual({
      awayGoalie: true, awaySkaters: 5, homeSkaters: 5, homeGoalie: true,
    });
    expect(parseSituationCode("1541")!.homeSkaters).toBe(4);
    expect(parseSituationCode("0651")!.awayGoalie).toBe(false); // empty net
    expect(parseSituationCode("bad")).toBeNull();
    expect(parseSituationCode(null)).toBeNull();
  });

  it("agrees with a correctly reconstructed stint", () => {
    const rows: RawShiftRow[] = [
      ...[1, 2, 3, 4, 5, 6].map(id => row(id, HOME, "00:00", "01:00")),
      ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
    ];
    const { shifts, report } = parseShifts(rows);
    const stints = buildStints(shifts, roster, HOME);
    const cov = buildCoverageReport({
      gameId: 1, parse: report, shifts, stints,
      events: [{ period: 1, sec: 30, situationCode: "1551" }],
    });
    expect(cov.strengthChecked).toBe(1);
    expect(cov.strengthAgreed).toBe(1);
    expect(cov.strengthAgreementPct).toBe(100);
  });

  it("catches a disagreement rather than silently passing", () => {
    const rows: RawShiftRow[] = [
      ...[1, 2, 3, 4, 6].map(id => row(id, HOME, "00:00", "01:00")), // only 4 home skaters
      ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
    ];
    const { shifts, report } = parseShifts(rows);
    const stints = buildStints(shifts, roster, HOME);
    const cov = buildCoverageReport({
      gameId: 1, parse: report, shifts, stints,
      events: [{ period: 1, sec: 30, situationCode: "1551" }], // claims 5v5
    });
    expect(cov.strengthAgreed).toBe(0);
    expect(cov.strengthAgreementPct).toBe(0);
  });
});

describe("findStintAt", () => {
  it("uses half-open intervals so a boundary belongs to the later stint", () => {
    const rows: RawShiftRow[] = [
      ...[1, 2].map(id => row(id, HOME, "00:00", "01:00")),
      row(3, HOME, "00:00", "00:30"),
      row(7, HOME, "00:30", "01:00"),
    ];
    const { shifts } = parseShifts(rows);
    const stints = buildStints(shifts, roster, HOME);
    expect(findStintAt(stints, 1, 29)!.endSec).toBe(30);
    expect(findStintAt(stints, 1, 30)!.startSec).toBe(30); // boundary → later stint
    expect(findStintAt(stints, 1, 999)).toBeNull();
  });
});

describe("coverage report", () => {
  it("reports zero tiling gap when stints cover the shift span", () => {
    const rows: RawShiftRow[] = [
      ...[1, 2, 3, 4, 5, 6].map(id => row(id, HOME, "00:00", "01:00")),
      ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
    ];
    const { shifts, report } = parseShifts(rows);
    const stints = buildStints(shifts, roster, HOME);
    const cov = buildCoverageReport({ gameId: 1, parse: report, shifts, stints });
    expect(cov.tilingGapSec).toBe(0);
    expect(cov.even5v5Sec).toBe(60);
    expect(cov.invalidSkaterCountStints).toBe(0);
    expect(cov.rosterJoinPct).toBe(100);
  });

  it("flags stints with impossible skater counts", () => {
    const rows: RawShiftRow[] = [
      ...[1, 2, 6].map(id => row(id, HOME, "00:00", "01:00")), // only 2 skaters
      ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
    ];
    const { shifts, report } = parseShifts(rows);
    const stints = buildStints(shifts, roster, HOME);
    const cov = buildCoverageReport({ gameId: 1, parse: report, shifts, stints });
    expect(cov.invalidSkaterCountStints).toBe(1);
  });
});

describe("forward-combination roll-up (line-file validation)", () => {
  it("accumulates ice time per forward group, excluding D and goalies", () => {
    const rows: RawShiftRow[] = [
      ...[1, 2].map(id => row(id, HOME, "00:00", "01:00")),
      ...[4, 5, 6].map(id => row(id, HOME, "00:00", "01:00")),
      row(3, HOME, "00:00", "00:30"),
      row(7, HOME, "00:30", "01:00"),
      ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
    ];
    const { shifts } = parseShifts(rows);
    const stints = buildStints(shifts, roster, HOME);
    const combos = forwardCombinationToi(stints, roster, HOME, HOME);

    expect(combos.get("1-2-3")!.seconds).toBe(30);
    expect(combos.get("1-2-7")!.seconds).toBe(30);
    // D and goalie never appear in a forward group
    for (const c of combos.values()) {
      expect(c.playerIds).not.toContain(4);
      expect(c.playerIds).not.toContain(6);
    }
  });

  it("can restrict to even 5v5 only", () => {
    const rows: RawShiftRow[] = [
      ...[1, 2, 3, 4, 6].map(id => row(id, HOME, "00:00", "01:00")), // 4 skaters — not 5v5
      ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
    ];
    const { shifts } = parseShifts(rows);
    const stints = buildStints(shifts, roster, HOME);
    expect(forwardCombinationToi(stints, roster, HOME, HOME).size).toBe(1);
    expect(forwardCombinationToi(stints, roster, HOME, HOME, { even5v5Only: true }).size).toBe(0);
  });
});

describe("line-label parsing (external file)", () => {
  it("splits and normalises a Natural Stat Trick style label", () => {
    expect(parseLineLabel("CHRIS KREIDER - TROY TERRY - LEO CARLSSON"))
      .toEqual(["chris kreider", "leo carlsson", "troy terry"]); // sorted
    expect(parseLineLabel("ALEX KILLORN - RYAN POEHLING")).toHaveLength(2);
  });
});
