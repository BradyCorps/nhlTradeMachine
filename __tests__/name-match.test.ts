import { describe, it, expect } from "vitest";
import {
  resolvePastedName,
  resolvePastedNames,
  buildNameIndex,
  resolveAgainstIndex,
  editDistance,
  splitName,
} from "@/app/lib/name-match";

/** A stand-in for the contract table the admin page already has loaded. */
const SYSTEM = [
  { name: "Yegor Chinakhov", team: "CBJ" },
  { name: "Nicholas Paul", team: "TBL" },
  { name: "Sam Montembeault", team: "MTL" },
  { name: "Macklin Celebrini", team: "SJS" },
  { name: "Alex Newhook", team: "MTL" },
  { name: "Ryan Smith", team: "DET" },
  { name: "Bryan Smith", team: "BOS" },
];

describe("name-match — the three the operator actually hit", () => {
  it("reconciles a romanisation that does not even share a first letter", () => {
    const r = resolvePastedName({ name: "Egor Chinakhov", team: "CBJ" }, SYSTEM);
    expect(r.match?.name).toBe("Yegor Chinakhov");
    expect(r.action).toBe("auto");
  });

  it("reconciles a short first name to the formal one", () => {
    expect(resolvePastedName({ name: "Nick Paul", team: "TBL" }, SYSTEM).match?.name)
      .toBe("Nicholas Paul");
  });

  it("reconciles a formal first name to the short one", () => {
    // The system holds the SHORT form here, so the mapping has to work in both
    // directions rather than only expanding.
    const r = resolvePastedName({ name: "Samuel Montembeault", team: "MTL" }, SYSTEM);
    expect(r.match?.name).toBe("Sam Montembeault");
    expect(r.action).toBe("auto");
  });

  it("matches a known variant even when the team has changed", () => {
    // A signing list is full of players moving clubs. Requiring the team to
    // agree would break exactly the rows the paste box exists for.
    const r = resolvePastedName({ name: "Egor Chinakhov", team: "NSH" }, SYSTEM);
    expect(r.match?.name).toBe("Yegor Chinakhov");
    expect(r.action).toBe("auto");
  });
});

describe("name-match — an exact hit stays exact", () => {
  it("finds the name unchanged", () => {
    const r = resolvePastedName({ name: "Macklin Celebrini", team: "SJS" }, SYSTEM);
    expect(r.match).toMatchObject({ name: "Macklin Celebrini", tier: "exact", action: "auto" });
  });

  it("ignores accents and punctuation", () => {
    const r = resolvePastedName({ name: "Sam Montembéault", team: "MTL" }, SYSTEM);
    expect(r.match?.tier).toBe("exact");
  });
});

describe("name-match — what it refuses to decide", () => {
  it("will not merge two people with one letter between them on different teams", () => {
    // Ryan and Bryan Smith are one edit apart and are not the same person.
    // Without a shared team there is nothing to tell them apart, so the loose
    // tiers do not run at all.
    expect(resolvePastedName({ name: "Bryan Smith", team: "BOS" }, SYSTEM).match?.name)
      .toBe("Bryan Smith");
    const r = resolvePastedName({ name: "Bryon Smith", team: "NYR" }, SYSTEM);
    expect(r.match).toBeNull();
    expect(r.action).toBe("none");
  });

  it("flags a shared surname on one team instead of guessing", () => {
    const r = resolvePastedName({ name: "Cole Newhook", team: "MTL" }, SYSTEM);
    expect(r.match?.name).toBe("Alex Newhook");
    expect(r.match?.tier).toBe("sameTeamSurname");
    expect(r.action).toBe("ambiguous");
  });

  it("suggests a near first name on the same team but asks first", () => {
    const r = resolvePastedName({ name: "Macklyn Celebrini", team: "SJS" }, SYSTEM);
    expect(r.match?.name).toBe("Macklin Celebrini");
    expect(r.action).toBe("confirm");
  });

  it("calls a tie ambiguous rather than taking the first one", () => {
    // Two candidates reaching the same tier means the tier is not the problem:
    // whichever it picked would look exactly as confident as a right answer.
    const twins = [
      { name: "Daniel Sedin", team: "VAN" },
      { name: "Henrik Sedin", team: "VAN" },
    ];
    const r = resolvePastedName({ name: "Mattias Sedin", team: "VAN" }, twins);
    expect(r.action).toBe("ambiguous");
    expect(r.alternatives).toHaveLength(1);
  });

  it("returns nothing for a genuinely new player", () => {
    const r = resolvePastedName({ name: "Maksymilian Szuber", team: "MTL" }, SYSTEM);
    expect(r.match).toBeNull();
    expect(r.action).toBe("none");
  });

  it("survives an empty candidate list", () => {
    expect(resolvePastedName({ name: "Nick Paul", team: "TBL" }, []).action).toBe("none");
  });
});

describe("name-match — the index behind the endpoint", () => {
  const index = buildNameIndex(SYSTEM.map(s => s.name));

  it("answers an exact name", () => {
    expect(resolveAgainstIndex("Macklin Celebrini", index))
      .toMatchObject({ name: "Macklin Celebrini", tier: "exact" });
  });

  it("answers a spelling variant, which is the whole point of it", () => {
    // Without this the ingest inserts a SECOND Chinakhov with a real cap hit,
    // and nothing downstream reports a duplicate.
    expect(resolveAgainstIndex("Egor Chinakhov", index))
      .toMatchObject({ name: "Yegor Chinakhov", tier: "variant" });
    expect(resolveAgainstIndex("Samuel Montembeault", index))
      .toMatchObject({ name: "Sam Montembeault", tier: "variant" });
  });

  it("refuses when the variant key fits two held players", () => {
    const twins = buildNameIndex(["Nick Paul", "Nicholas Paul"]);
    const hit = resolveAgainstIndex("Nicholas Paul", twins);
    // The exact spelling still wins outright — only a name matching neither
    // exactly is refused.
    expect(hit.tier).toBe("exact");
    expect(resolveAgainstIndex("Nicky Paul", twins)).toMatchObject({
      name: null, tier: null, ambiguous: ["Nick Paul", "Nicholas Paul"],
    });
  });

  it("counts one player spelled two ways as one player", () => {
    // Both of these are really in the table. The id strips accents and dots,
    // so they are already the same person; treating them as a conflict would
    // block every near-miss on that surname over a fight that does not exist.
    const doubled = buildNameIndex([
      "Alexis Lafreniere", "Alexis Lafrenière", "J.T. Miller", "JT Miller",
    ]);
    expect(resolveAgainstIndex("Alexis Lafreniere", doubled).tier).toBe("exact");
    expect(doubled.byVariant.get("alexis-lafreniere")).toHaveLength(1);
    expect(doubled.byVariant.get("jt-miller")).toHaveLength(1);
  });

  it("has no opinion about a name it does not hold", () => {
    expect(resolveAgainstIndex("Maksymilian Szuber", index))
      .toEqual({ name: null, tier: null, ambiguous: [] });
  });

  it("does not reach for the team-based tiers, having no human to ask", () => {
    // `sameTeamNear` would match this one in the UI. The endpoint gets no
    // confirmation step, so it gets nothing it cannot be sure of.
    expect(resolveAgainstIndex("Macklyn Celebrini", index).name).toBeNull();
  });
});

describe("name-match — the pieces", () => {
  it("keeps a hyphenated first name in one piece", () => {
    // Punctuation is stripped before the split, so the surname is the surname
    // rather than the back half of the given name.
    expect(splitName("Pierre-Luc Dubois")).toEqual({ first: "pierreluc", last: "dubois" });
    expect(splitName("Nick Paul")).toEqual({ first: "nick", last: "paul" });
    expect(splitName("Jack St. Ivany")).toEqual({ first: "jack", last: "st-ivany" });
  });

  it("counts edits and gives up past the cap", () => {
    expect(editDistance("egor", "yegor")).toBe(1);
    expect(editDistance("sam", "samuel")).toBe(3);
    expect(editDistance("a", "abcdefgh", 2)).toBe(3);
  });

  it("resolves a whole list keyed by what was pasted", () => {
    const out = resolvePastedNames(
      [{ name: "Egor Chinakhov", team: "CBJ" }, { name: "Nick Paul", team: "TBL" }],
      SYSTEM,
    );
    expect(out.get("Egor Chinakhov")?.match?.name).toBe("Yegor Chinakhov");
    expect(out.get("Nick Paul")?.match?.name).toBe("Nicholas Paul");
  });
});
