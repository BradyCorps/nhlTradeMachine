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
  gameElapsedSec,
  attributeEvent,
  eventAttributionMode,
  zoneFromEventHomePerspective,
  buildScoreTimeline,
  scoreAt,
  buildStintRows,
  type RawShiftRow,
  type RosterSpot,
  type PbpEvent,
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

describe("boundary tolerance is narrow, not a blanket excuse", () => {
  // Home swaps a forward at 0:30. An event stamped exactly at 0:30 is genuinely
  // ambiguous — the PBP records it under the outgoing lineup, the shift chart
  // has already started the incoming one.
  const rows: RawShiftRow[] = [
    ...[1, 2].map(id => row(id, HOME, "00:00", "01:00")),
    ...[4, 5, 6].map(id => row(id, HOME, "00:00", "01:00")),
    row(3, HOME, "00:00", "00:30"),
    row(7, HOME, "00:30", "01:00"),
    ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
  ];

  it("forgives only a genuine boundary instant", () => {
    const { shifts, report } = parseShifts(rows);
    const stints = buildStints(shifts, roster, HOME);
    const cov = buildCoverageReport({
      gameId: 1, parse: report, shifts, stints,
      events: [{ period: 1, sec: 30, situationCode: "1551", typeDescKey: "faceoff" }],
    });
    // Both adjacent lineups are 5v5 here, so strict already agrees.
    expect(cov.strengthAgreed).toBe(1);
    expect(cov.strengthAgreedBoundaryTolerant).toBe(1);
  });

  it("does NOT forgive a mid-stint mismatch — real errors still fail", () => {
    // 4 home skaters all period; PBP claims 5v5 at a NON-boundary second.
    const broken: RawShiftRow[] = [
      ...[1, 2, 3, 6].map(id => row(id, HOME, "00:00", "01:00")),
      ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
    ];
    const { shifts, report } = parseShifts(broken);
    const stints = buildStints(shifts, roster, HOME);
    const cov = buildCoverageReport({
      gameId: 1, parse: report, shifts, stints,
      events: [{ period: 1, sec: 25, situationCode: "1551", typeDescKey: "shot-on-goal" }],
    });
    expect(cov.strengthAgreed).toBe(0);
    expect(cov.strengthAgreedBoundaryTolerant).toBe(0); // tolerance must NOT rescue it
    expect(cov.disagreementsAtBoundary).toBe(0);
    expect(cov.disagreementsByEventType["shot-on-goal"]).toBe(1);
    expect(cov.disagreementSamples[0]).toMatchObject({ derived: "5v3", claimed: "5v5" });
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

// ── Stint emission (the fittable dataset) ────────────────────────

describe("gameElapsedSec", () => {
  it("stacks regulation periods and shortens overtime", () => {
    expect(gameElapsedSec(1, 0)).toBe(0);
    expect(gameElapsedSec(1, 754)).toBe(754);
    expect(gameElapsedSec(2, 0)).toBe(1200);
    expect(gameElapsedSec(3, 1200)).toBe(3600);
    expect(gameElapsedSec(4, 0)).toBe(3600);   // OT starts where regulation ended
    expect(gameElapsedSec(5, 0)).toBe(3900);   // OT is 5:00, not 20:00
  });
});

describe("event attribution", () => {
  // Two stints back to back: 0–30 and 30–60.
  const { shifts } = parseShifts([
    ...[1, 2].map(id => row(id, HOME, "00:00", "01:00")),
    ...[4, 5, 6].map(id => row(id, HOME, "00:00", "01:00")),
    row(3, HOME, "00:00", "00:30"),
    row(7, HOME, "00:30", "01:00"),
    ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
  ]);
  const stints = buildStints(shifts, roster, HOME);

  it("gives a stoppage-causing event to the lineup that played up to it", () => {
    // A goal at 0:30 was scored by the players on the ice BEFORE the change.
    expect(attributeEvent(stints, 1, 30, "trailing")?.startSec).toBe(0);
    expect(attributeEvent(stints, 1, 30, "leading")?.startSec).toBe(30);
  });

  it("gives a faceoff to the lineup taking the ice", () => {
    expect(eventAttributionMode("faceoff")).toBe("leading");
    expect(eventAttributionMode("period-start")).toBe("leading");
    expect(eventAttributionMode("goal")).toBe("trailing");
    expect(eventAttributionMode("shot-on-goal")).toBe("trailing");
    expect(eventAttributionMode(undefined)).toBe("trailing");
  });

  it("falls back to the opening lineup at the first instant of a period", () => {
    // Nothing precedes 0:00, so the trailing rule has nothing to land on.
    expect(attributeEvent(stints, 1, 0, "trailing")?.startSec).toBe(0);
  });

  it("returns null outside the reconstructed span", () => {
    expect(attributeEvent(stints, 1, 90, "trailing")).toBeNull();
    expect(attributeEvent(stints, 2, 10, "leading")).toBeNull();
  });
});

describe("zone from the home team's perspective", () => {
  it("keeps the home team's own zone code", () => {
    expect(zoneFromEventHomePerspective({ zoneCode: "O", eventOwnerTeamId: HOME }, HOME)).toBe("O");
    expect(zoneFromEventHomePerspective({ zoneCode: "D", eventOwnerTeamId: HOME }, HOME)).toBe("D");
  });

  it("flips the away team's zone code", () => {
    // The away team's offensive zone IS the home team's defensive zone.
    expect(zoneFromEventHomePerspective({ zoneCode: "O", eventOwnerTeamId: AWAY }, HOME)).toBe("D");
    expect(zoneFromEventHomePerspective({ zoneCode: "D", eventOwnerTeamId: AWAY }, HOME)).toBe("O");
  });

  it("treats neutral as neutral for both, and gives up when it cannot tell", () => {
    expect(zoneFromEventHomePerspective({ zoneCode: "N", eventOwnerTeamId: AWAY }, HOME)).toBe("N");
    expect(zoneFromEventHomePerspective({ zoneCode: "N", eventOwnerTeamId: null }, HOME)).toBe("N");
    expect(zoneFromEventHomePerspective({ zoneCode: "O", eventOwnerTeamId: null }, HOME)).toBeNull();
    expect(zoneFromEventHomePerspective({ zoneCode: null, eventOwnerTeamId: HOME }, HOME)).toBeNull();
  });
});

describe("score state", () => {
  const events: PbpEvent[] = [
    { period: 1, sec: 300, typeDescKey: "goal", homeScore: 1, awayScore: 0 },
    { period: 2, sec: 60, typeDescKey: "goal", homeScore: 1, awayScore: 1 },
    { period: 1, sec: 700, typeDescKey: "shot-on-goal" }, // not a goal; ignored
  ];

  it("builds a timeline on game-elapsed seconds, in order", () => {
    expect(buildScoreTimeline(events).map(g => g.at)).toEqual([300, 1260]);
  });

  it("reports the score as it stood, never a future goal", () => {
    const t = buildScoreTimeline(events);
    expect(scoreAt(t, 0)).toEqual({ homeScore: 0, awayScore: 0 });
    expect(scoreAt(t, 299)).toEqual({ homeScore: 0, awayScore: 0 });
    expect(scoreAt(t, 300)).toEqual({ homeScore: 1, awayScore: 0 });
    expect(scoreAt(t, 1259)).toEqual({ homeScore: 1, awayScore: 0 });
    expect(scoreAt(t, 5000)).toEqual({ homeScore: 1, awayScore: 1 });
  });
});

describe("buildStintRows", () => {
  const { shifts } = parseShifts([
    ...[1, 2].map(id => row(id, HOME, "00:00", "01:00")),
    ...[4, 5, 6].map(id => row(id, HOME, "00:00", "01:00")),
    row(3, HOME, "00:00", "00:30"),
    row(7, HOME, "00:30", "01:00"),
    ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
  ]);
  const stints = buildStints(shifts, roster, HOME);

  const events: PbpEvent[] = [
    { period: 1, sec: 0, typeDescKey: "faceoff", eventOwnerTeamId: HOME, zoneCode: "N" },
    { period: 1, sec: 15, typeDescKey: "shot-on-goal", eventOwnerTeamId: HOME, shooterId: 1 },
    // Goal on the same second the line changes — scored by the OUTGOING five.
    { period: 1, sec: 30, typeDescKey: "goal", eventOwnerTeamId: HOME, shooterId: 3,
      homeScore: 1, awayScore: 0 },
    // Faceoff on that same second belongs to the INCOMING five.
    { period: 1, sec: 30, typeDescKey: "faceoff", eventOwnerTeamId: AWAY, zoneCode: "O" },
    { period: 1, sec: 45, typeDescKey: "blocked-shot", eventOwnerTeamId: HOME, shooterId: 11 },
    { period: 1, sec: 300, typeDescKey: "shot-on-goal", eventOwnerTeamId: AWAY, shooterId: 12 },
  ];

  const build = () => buildStintRows({
    season: "20252026", gameId: 2025020001,
    homeTeamId: HOME, awayTeamId: AWAY, stints, events,
  });

  it("emits one row per stint, indexed in play order", () => {
    const { rows } = build();
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.stintIdx)).toEqual([0, 1]);
    expect(rows.map(r => r.startSec)).toEqual([0, 30]);
    expect(rows[0]).toMatchObject({
      season: "20252026", gameId: 2025020001, gameStartSec: 0,
      homeTeamId: HOME, awayTeamId: AWAY, strength: "5v5", isEven5v5: true,
    });
  });

  it("credits a goal to the lineup that scored it, not the one that replaced it", () => {
    const { rows } = build();
    expect(rows[0].homeGoals).toBe(1);
    expect(rows[1].homeGoals).toBe(0);
    // The scorer is on the ice in the credited row and absent from the next one.
    expect(rows[0].homeSkaters).toContain(3);
    expect(rows[1].homeSkaters).not.toContain(3);
  });

  it("keeps shooter ids so the OZ target can exclude the focal player", () => {
    const { rows } = build();
    expect(rows[0].shots.map(s => ({ id: s.shooterId, kind: s.kind }))).toEqual([
      { id: 1, kind: "shot-on-goal" },
      { id: 3, kind: "goal" },
    ]);
  });

  it("attributes a blocked shot to the attacking side, not the blocking side", () => {
    // The NHL feed owns a blocked shot to the BLOCKER. Home blocked it here,
    // so the attempt belongs to the away team.
    const { rows } = build();
    const blocked = rows[1].shots.find(s => s.kind === "blocked-shot");
    expect(blocked?.teamId).toBe(AWAY);
    expect(rows[1].awayCorsi).toBe(1);
    expect(rows[1].homeCorsi).toBe(0);
  });

  it("records the score as it stood at the start of each stint", () => {
    const { rows } = build();
    expect(rows[0]).toMatchObject({ homeScore: 0, awayScore: 0 }); // before the goal
    expect(rows[1]).toMatchObject({ homeScore: 1, awayScore: 0 }); // after it
  });

  it("marks a faceoff start and flips the zone into home terms", () => {
    const { rows } = build();
    expect(rows[0]).toMatchObject({ startedOnFaceoff: true, startZoneHome: "N" });
    // Away team's offensive-zone faceoff = home team's defensive zone.
    expect(rows[1]).toMatchObject({ startedOnFaceoff: true, startZoneHome: "D" });
  });

  it("counts events that fall outside every stint instead of dropping them silently", () => {
    const { report } = build();
    expect(report.unattributedEvents).toBe(1); // the 5:00 shot, past the last shift
    expect(report.attributedEvents).toBe(5);
    expect(report.shotsAttributed).toBe(3);
    expect(report.shotsWithoutShooter).toBe(0);
  });

  it("is deterministic for the same inputs", () => {
    expect(JSON.stringify(build().rows)).toBe(JSON.stringify(build().rows));
  });
});

describe("attribution rule is evidenced, not asserted", () => {
  const { shifts } = parseShifts([
    ...[1, 2].map(id => row(id, HOME, "00:00", "01:00")),
    ...[4, 5, 6].map(id => row(id, HOME, "00:00", "01:00")),
    row(3, HOME, "00:00", "00:30"),
    // No replacement for F3 after 0:30 — the home side is short from then on.
    ...[11, 12, 13, 14, 15, 16].map(id => row(id, AWAY, "00:00", "01:00")),
  ]);
  const stints = buildStints(shifts, roster, HOME);

  it("scores the trailing rule higher when the event precedes the change", () => {
    // A goal at 0:30 is stamped 5v5 — the change has not happened yet in the
    // play-by-play's telling, though the shift chart has already ended F3.
    const events: PbpEvent[] = [{
      period: 1, sec: 30, typeDescKey: "goal",
      situationCode: "1551", eventOwnerTeamId: HOME, shooterId: 3,
      homeScore: 1, awayScore: 0,
    }];
    const { report } = buildStintRows({
      season: "20252026", gameId: 1, homeTeamId: HOME, awayTeamId: AWAY, stints, events,
    });
    expect(report.strengthChecked).toBe(1);
    expect(report.strengthAgreedTrailing).toBe(1); // 5v5 stint, matches
    expect(report.strengthAgreedLeading).toBe(0);  // 5v4 stint, does not
  });
});
