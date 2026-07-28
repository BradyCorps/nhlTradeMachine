// ── AI cap compliance ────────────────────────────────────────────
// From a Year-2 Cup Run: LAK $8.8M over, NSH $12.0M over, no club in the league
// with more than $0.8M of space, and Cale Makar / Justin Faulk / John Carlson —
// three defencemen — stranded in the free-agent pool. One causal chain.
import { describe, expect, it } from "vitest";
import {
  planCapCompliance, protectedCore, valuePerDollar, committedCapOf,
  marketBudgetFor, marketReserveShare, type CapPlayer,
} from "@/app/lib/ai-cap";

const d = (id: string, capHit: number, ptsPace: number, avgTOI: number, over: Partial<CapPlayer> = {}): CapPlayer =>
  ({ id, name: id, position: "D", capHit, ptsPace, avgTOI, games: 82, ...over });
const f = (id: string, capHit: number, ptsPace: number, avgTOI: number, over: Partial<CapPlayer> = {}): CapPlayer =>
  ({ id, name: id, position: "C", capHit, ptsPace, avgTOI, games: 82, ...over });
const g = (id: string, capHit: number): CapPlayer =>
  ({ id, name: id, position: "G", capHit, games: 60 });

// A roster shaped like a real one: an elite D on a big deal, a bloated
// middle-six forward, and replaceable depth.
const makar = d("makar", 9.0, 80, 25.5);
const roster = (): CapPlayer[] => [
  makar,
  d("secondPair", 4.5, 30, 20),
  d("thirdPair", 2.0, 14, 16),
  d("depthD1", 1.2, 10, 15),
  d("depthD2", 1.0, 8, 14),
  d("depthD3", 0.8, 6, 13),
  f("star", 11.0, 95, 21),
  f("overpaid", 6.5, 32, 14),      // the genuine bad contract
  f("solid", 5.0, 60, 18),
  f("useful", 3.0, 45, 16),
  ...Array.from({ length: 8 }, (_, i) => f(`depthF${i}`, 1.0, 20, 11)),
  g("starter", 5.0), g("backup", 1.5),
];

describe("valuePerDollar respects deployment, not just points", () => {
  it("does not rank an elite defenceman below a mediocre forward", () => {
    // The old metric was ptsPace/capHit: Makar 80/9 = 8.9 vs overpaid 32/6.5 =
    // 4.9 — but a 30-point third-pair D at $2M scored 15 and got kept over him.
    expect(valuePerDollar(makar)).toBeGreaterThan(valuePerDollar(f("overpaid", 6.5, 32, 14)));
  });

  it("treats a free contract as untouchable rather than worthless", () => {
    expect(valuePerDollar(f("free", 0, 10, 10))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("protectedCore — the players a club will never waive", () => {
  it("protects the top defencemen and forwards by contribution", () => {
    const keep = protectedCore(roster());
    expect(keep.has("makar")).toBe(true);
    expect(keep.has("star")).toBe(true);
  });

  it("does not protect the bad contract", () => {
    expect(protectedCore(roster()).has("overpaid")).toBe(false);
  });
});

describe("planCapCompliance", () => {
  it("does nothing when the club is already under the ceiling", () => {
    const plan = planCapCompliance(roster(), { ceiling: 200 });
    expect(plan.cuts).toEqual([]);
    expect(plan.compliant).toBe(true);
  });

  it("never waives the best defenceman to get compliant", () => {
    const plan = planCapCompliance(roster(), { ceiling: committedCapOf(roster()) - 6 });
    expect(plan.cuts.map(c => c.id)).not.toContain("makar");
    expect(plan.cuts.map(c => c.id)).not.toContain("star");
  });

  it("sheds the bad contract first", () => {
    const plan = planCapCompliance(roster(), { ceiling: committedCapOf(roster()) - 3 });
    expect(plan.cuts[0].id).toBe("overpaid");
  });

  it("reaches compliance even at a minimum-size roster", () => {
    // The old pass refused to cut a forward below 13F or a D below 7D. Repair
    // refilled to exactly 12F/6D, so the next pass had no legal candidate and
    // clubs finished $12M over. Cutting below minimum is allowed on purpose —
    // repair refills at replacement cost right after.
    const minimum = [
      makar,
      ...Array.from({ length: 5 }, (_, i) => d(`d${i}`, 4.0, 25, 19)),
      ...Array.from({ length: 12 }, (_, i) => f(`f${i}`, 4.0, 40, 15)),
      g("g1", 5), g("g2", 1.5),
    ];
    const plan = planCapCompliance(minimum, { ceiling: committedCapOf(minimum) - 12 });
    expect(plan.cuts.length).toBeGreaterThan(0);
    expect(plan.compliant).toBe(true);
  });

  it("never cuts a goaltender", () => {
    const plan = planCapCompliance(roster(), { ceiling: 30 });
    expect(plan.cuts.every(c => c.position !== "G")).toBe(true);
  });

  it("respects a no-move clause", () => {
    const withNmc = roster().map(p => p.id === "overpaid" ? { ...p, hasNMC: true } : p);
    const plan = planCapCompliance(withNmc, { ceiling: committedCapOf(withNmc) - 3 });
    expect(plan.cuts.map(c => c.id)).not.toContain("overpaid");
  });

  it("counts the saving net of the replacement, not the whole cap hit", () => {
    // Cutting a $5M player and dressing a $0.8M call-up saves $4.2M.
    const small = [f("a", 5, 40, 15), f("b", 5, 40, 15), f("c", 5, 40, 15),
                   f("d1", 5, 40, 15), f("e", 5, 40, 15), f("f1", 5, 40, 15),
                   f("cut-me", 5, 10, 9)];
    const plan = planCapCompliance(small, { ceiling: committedCapOf(small) - 4.2, protect: { D: 0, F: 6 } });
    expect(plan.cuts.map(c => c.id)).toEqual(["cut-me"]);
    expect(plan.compliant).toBe(true);
  });

  it("reports honestly when cutting cannot get there", () => {
    // Everyone protected or on an NMC: no legal cut exists.
    const stuck = [
      f("a", 20, 90, 21, { hasNMC: true }),
      f("b", 20, 90, 21, { hasNMC: true }),
      g("g1", 5),
    ];
    const plan = planCapCompliance(stuck, { ceiling: 10 });
    expect(plan.cuts).toEqual([]);
    expect(plan.compliant).toBe(false);
  });
});

describe("marketBudgetFor — the league must not spend itself to zero", () => {
  it("leaves a rebuilding club real space instead of $0.8M", () => {
    // The old flat $0.775M reserve is literally the "no team has more than 0.8"
    // symptom: every club spent to the floor and stopped.
    expect(marketBudgetFor(30, "Rebuilding")).toBe(15);
    expect(30 - marketBudgetFor(30, "Rebuilding")).toBeGreaterThan(0.8);
  });

  it("lets a contender push its chips in", () => {
    expect(marketBudgetFor(20, "Contender")).toBe(19);
  });

  it("still lets a club with little space sign someone", () => {
    // A hard floor would zero this out and freeze the middle of the league.
    expect(marketBudgetFor(3.1, "Retooling")).toBeCloseTo(2.17, 2);
  });

  it("never spends the last league-minimum slot", () => {
    expect(marketBudgetFor(1.0, "Contender")).toBeCloseTo(0.225, 3);
    expect(marketBudgetFor(0.5, "Contender")).toBe(0);
    expect(marketBudgetFor(0, "Contender")).toBe(0);
  });

  it("holds back more the further a club is from contending", () => {
    const shares = ["Contender", "Bubble", "Retooling", "Rebuilding", "Deep Rebuild"]
      .map(marketReserveShare);
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
  });

  it("leaves league-wide room to absorb a cut star", () => {
    // The real failure: Makar cut, and not one club could afford him.
    const league = [
      { space: 30, phase: "Rebuilding" }, { space: 22, phase: "Retooling" },
      { space: 12, phase: "Bubble" }, { space: 9, phase: "Contender" },
    ];
    const leftover = league.reduce((s, t) => s + (t.space - marketBudgetFor(t.space, t.phase)), 0);
    expect(leftover).toBeGreaterThan(9.0);
  });
});
