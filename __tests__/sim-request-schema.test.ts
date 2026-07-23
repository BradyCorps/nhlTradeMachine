// ── SIM request validation (audit #4) ────────────────────────────
import { describe, it, expect } from "vitest";
import { simRequestSchema, SIM_LIMITS } from "@/app/lib/sim-request-schema";

const player = (id: string, over: Record<string, unknown> = {}) => ({
  id, position: "C", capHit: 5, ptsPace: 60, ...over,
});
const team = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: id, phase: "Bubble", standing: 1, capSpace: 8, ...over,
});

const base = () => ({
  homeTeamId: "WPG",
  partnerTeamId: "",
  teams: [team("WPG"), team("EDM")],
  players: [player("p1", { teamId: "WPG" }), player("p2", { teamId: "EDM" })],
  trades: [] as unknown[],
});

describe("simRequestSchema — accepts a well-formed request", () => {
  it("parses and preserves engine fields via passthrough", () => {
    const res = simRequestSchema.safeParse(base());
    expect(res.success).toBe(true);
    if (res.success) {
      // Passthrough keeps fields the schema never named.
      expect((res.data.players[0] as any).ptsPace).toBe(60);
      expect((res.data.teams[0] as any).phase).toBe("Bubble");
    }
  });

  it("allows an empty partnerTeamId (solo-team season)", () => {
    expect(simRequestSchema.safeParse(base()).success).toBe(true);
  });
});

describe("simRequestSchema — rejects malformed / hostile payloads", () => {
  it("rejects a homeTeamId that matches no team", () => {
    const res = simRequestSchema.safeParse({ ...base(), homeTeamId: "NOPE" });
    expect(res.success).toBe(false);
  });

  it("rejects duplicate team ids", () => {
    const res = simRequestSchema.safeParse({ ...base(), teams: [team("WPG"), team("WPG")] });
    expect(res.success).toBe(false);
  });

  it("rejects duplicate player ids", () => {
    const res = simRequestSchema.safeParse({ ...base(), players: [player("dup"), player("dup")] });
    expect(res.success).toBe(false);
  });

  it("rejects a player missing an id", () => {
    const res = simRequestSchema.safeParse({ ...base(), players: [{ position: "C" }] });
    expect(res.success).toBe(false);
  });

  it("rejects an oversized player array (DoS guard)", () => {
    const players = Array.from({ length: SIM_LIMITS.MAX_PLAYERS + 1 }, (_, i) => player(`p${i}`));
    expect(simRequestSchema.safeParse({ ...base(), players }).success).toBe(false);
  });

  it("rejects too few teams", () => {
    expect(simRequestSchema.safeParse({ ...base(), teams: [team("WPG")], homeTeamId: "WPG" }).success).toBe(false);
  });

  it("rejects a non-finite seed", () => {
    expect(simRequestSchema.safeParse({ ...base(), seed: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(simRequestSchema.safeParse({ ...base(), seed: Number.NaN }).success).toBe(false);
  });

  it("rejects a trade that references an unknown team", () => {
    const res = simRequestSchema.safeParse({
      ...base(),
      trades: [{ homeTeamId: "WPG", partnerTeamId: "GHOST", outgoing: [], incoming: [] }],
    });
    expect(res.success).toBe(false);
  });
});
