import { describe, expect, it } from "vitest";
import { seedFreeAgentStatus, FREE_AGENT_SEED_2026 } from "../app/lib/free-agent-seed";

describe("2026 free-agent seed", () => {
  it("marks Alex Tuch as a UFA (the canonical S1.5 miss)", () => {
    expect(seedFreeAgentStatus("Alex Tuch")).toBe("UFA");
  });

  it("classifies marquee RFAs and UFAs from the curated class", () => {
    expect(seedFreeAgentStatus("Jason Robertson")).toBe("RFA");
    expect(seedFreeAgentStatus("Connor Bedard")).toBe("RFA");
    expect(seedFreeAgentStatus("Alex Ovechkin")).toBe("UFA");
    expect(seedFreeAgentStatus("Jacob Trouba")).toBe("UFA");
  });

  it("matches case-insensitively and ignores accents", () => {
    expect(seedFreeAgentStatus("alex tuch")).toBe("UFA");
    expect(seedFreeAgentStatus("Leevi Meriläinen")).toBe("RFA");
  });

  it("returns null for signed players and empty input", () => {
    expect(seedFreeAgentStatus("Connor McDavid")).toBeNull();
    expect(seedFreeAgentStatus("")).toBeNull();
    expect(seedFreeAgentStatus(null)).toBeNull();
  });

  it("covers the full curated class without duplicate collisions", () => {
    // 30 UFA + 25 RFA names, all distinct after normalization.
    expect(FREE_AGENT_SEED_2026.size).toBe(55);
  });
});
